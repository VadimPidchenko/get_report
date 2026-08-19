"""HTTP-эндпоинты сборки и скачивания отчётов."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import REPORT_DOCX_NAME, REPORT_PDF_NAME
from app.services import drafts as drafts_service
from app.services import reports as reports_service
from app.services.reports import GeneratorError

router = APIRouter(prefix="/api", tags=["reports"])

SUPPORTED_FORMATS = ("docx", "pdf")
DOWNLOAD_BASENAME = "Отчёт о тестировании"

#: Символы, которые файловые системы не принимают в именах файлов.
ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _clean_part(value) -> str:
    """Готовит кусок имени файла: без запрещённых символов и лишних пробелов."""
    return ILLEGAL_FILENAME_CHARS.sub("", str(value or "")).strip()


def build_download_name(draft_id: str, suffix: str) -> str:
    """Имя, под которым файл сохранится у пользователя.

    Складывается из проекта и даты отчёта — такой файл понятно переслать
    заказчику, не переименовывая. На диске имя остаётся служебным: от него
    зависит кеш сборки, и трогать его нельзя.

    Пустые куски выпадают, поэтому у отчёта без даты не будет двойных пробелов.
    """
    parts = [DOWNLOAD_BASENAME]

    try:
        draft = drafts_service.read_draft(draft_id)
    except (OSError, ValueError):
        draft = {}  # файла нет или он повреждён — хватит и базового имени

    parts.append(_clean_part(draft.get("project")))
    parts.append(_clean_part(draft.get("date")))

    return " ".join(part for part in parts if part) + suffix


@router.post("/report/{output_format}")
def build_report(output_format: str, draft: dict):
    """Готовит отчёт и сообщает, какой файл забирать.

    Повторный запрос без изменений в черновике отдаёт файл из кеша.
    """
    if output_format not in SUPPORTED_FORMATS:
        raise HTTPException(400, "Доступные форматы: docx, pdf")

    try:
        result = reports_service.build_report(draft, output_format)
    except GeneratorError as error:
        raise HTTPException(500, str(error)) from error

    return {"file": result.filename, "cached": result.from_cache}


@router.get("/report/{draft_id}/{filename}")
def download_report(draft_id: str, filename: str):
    """Отдаёт готовый файл под понятным именем."""
    if filename not in (REPORT_DOCX_NAME, REPORT_PDF_NAME):
        raise HTTPException(400, "Неизвестный файл отчёта")

    path = reports_service.report_path(draft_id, filename)
    if not path.exists():
        raise HTTPException(404, "Файл отчёта не найден")

    download_name = build_download_name(draft_id, Path(filename).suffix)
    return FileResponse(path, filename=download_name)
