"""Сборка отчёта в docx и pdf.

Файлы лежат в reports/{draft_id}/ рядом с отпечатком содержимого. Пока черновик
не менялся, повторное скачивание отдаёт готовый файл без пересборки.

Генератор — отдельный скрипт на Node, запускается в одном из режимов:
    docx — собрать только документ (быстро, без LibreOffice)
    pdf — собрать документ и сконвертировать
    convert — сконвертировать уже готовый документ
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from app.config import (
    REPORT_DOCX_NAME,
    REPORT_HASH_NAME,
    REPORT_PDF_NAME,
)
from app.services.generator_runner import GeneratorError, run_generator
from app.storage.files import (
    ensure_directory,
    remove_file_if_exists,
    write_text_atomic,
)
from app.storage.paths import (
    draft_images_path,
    draft_reports_path,
    report_file_path,
)


@dataclass
class ReportResult:
    filename: str
    from_cache: bool


def report_path(draft_id: str, filename: str) -> Path:
    """Возвращает путь к отчёту, не создавая каталогов."""
    return report_file_path(draft_id, filename)


def content_hash(draft: dict) -> str:
    """Отпечаток содержимого черновика.

    Служебные поля не учитываем: переименование черновика не должно
    считаться изменением отчёта.
    """
    payload = {key: value for key, value in draft.items() if key not in ("_id", "_title")}
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _read_stored_hash(hash_file: Path) -> str | None:
    if not hash_file.exists():
        return None
    return hash_file.read_text(encoding="utf-8").strip()


def _choose_mode(output_format: str, is_fresh: bool, docx_ready: bool) -> str:
    """Выбирает минимальную работу, которой хватит для нужного формата."""
    if output_format == "docx":
        return "docx"
    if is_fresh and docx_ready:
        return "convert"  # документ уже собран, остаётся конвертация
    return "pdf"


def build_report(draft: dict, output_format: str) -> ReportResult:
    """Готовит отчёт нужного формата и возвращает имя файла.

    Если содержимое черновика не менялось с прошлой сборки, файл берётся
    из кеша. При изменениях устаревшие файлы удаляются.
    """
    draft_id = draft.get("_id") or "unsaved"
    folder = ensure_directory(draft_reports_path(draft_id))

    docx_file = report_file_path(draft_id, REPORT_DOCX_NAME)
    pdf_file = report_file_path(draft_id, REPORT_PDF_NAME)
    hash_file = report_file_path(draft_id, REPORT_HASH_NAME)
    requested_file = docx_file if output_format == "docx" else pdf_file

    current_hash = content_hash(draft)
    is_fresh = _read_stored_hash(hash_file) == current_hash

    if not is_fresh:
        for stale_file in (docx_file, pdf_file):
            remove_file_if_exists(stale_file)

    if is_fresh and requested_file.exists():
        return ReportResult(filename=requested_file.name, from_cache=True)

    mode = _choose_mode(output_format, is_fresh, docx_file.exists())
    run_generator(draft, draft_images_path(draft_id), folder, mode)

    if not requested_file.exists():
        raise GeneratorError("Генератор отработал, но файл не появился")

    write_text_atomic(hash_file, current_hash)
    return ReportResult(filename=requested_file.name, from_cache=False)
