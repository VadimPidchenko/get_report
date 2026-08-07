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
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.config import (
    GENERATOR_SCRIPT,
    GENERATOR_TIMEOUT_SECONDS,
    IMAGES_DIR,
    REPORT_DOCX_NAME,
    REPORT_HASH_NAME,
    REPORT_PDF_NAME,
    REPORTS_DIR,
)


class GeneratorError(RuntimeError):
    """Генератор не смог собрать отчёт."""


@dataclass
class ReportResult:
    filename: str
    from_cache: bool


def reports_dir(draft_id: str) -> Path:
    """Папка отчётов черновика, создаётся при первом обращении."""
    folder = REPORTS_DIR / draft_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def report_path(draft_id: str, filename: str) -> Path:
    return REPORTS_DIR / draft_id / filename


def content_hash(draft: dict) -> str:
    """Отпечаток содержимого черновика.

    Служебные поля не учитываем: переименование черновика не должно
    считаться изменением отчёта.
    """
    payload = {key: value for key, value in draft.items() if key not in ("_id", "_title")}
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _read_stored_hash(folder: Path) -> str | None:
    hash_file = folder / REPORT_HASH_NAME
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


def _run_generator(draft: dict, draft_id: str, output_dir: Path, mode: str) -> None:
    """Запускает Node-генератор. В режиме convert данные не нужны."""
    data_file = None
    if mode != "convert":
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as temp:
            json.dump(draft, temp, ensure_ascii=False)
            data_file = temp.name

    command = [
        "node",
        str(GENERATOR_SCRIPT),
        data_file or os.devnull,
        str(IMAGES_DIR / draft_id),
        str(output_dir),
        mode,
    ]

    process = None
    try:
        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=GENERATOR_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as error:
        raise GeneratorError("Node.js не найден — установите его, чтобы собирать отчёты") from error
    except subprocess.TimeoutExpired as error:
        raise GeneratorError("Генерация заняла слишком много времени") from error
    finally:
        if data_file:
            try:
                os.unlink(data_file)
            except OSError:
                pass

    if process.returncode != 0:
        raise GeneratorError(f"Генератор завершился с ошибкой:\n{process.stderr}")


def build_report(draft: dict, output_format: str) -> ReportResult:
    """Готовит отчёт нужного формата и возвращает имя файла.

    Если содержимое черновика не менялось с прошлой сборки, файл берётся
    из кеша. При изменениях устаревшие файлы удаляются.
    """
    draft_id = draft.get("_id") or "unsaved"
    folder = reports_dir(draft_id)

    docx_file = folder / REPORT_DOCX_NAME
    pdf_file = folder / REPORT_PDF_NAME
    requested_file = docx_file if output_format == "docx" else pdf_file

    current_hash = content_hash(draft)
    is_fresh = _read_stored_hash(folder) == current_hash

    if not is_fresh:
        for stale_file in (docx_file, pdf_file):
            if stale_file.exists():
                stale_file.unlink()

    if is_fresh and requested_file.exists():
        return ReportResult(filename=requested_file.name, from_cache=True)

    mode = _choose_mode(output_format, is_fresh, docx_file.exists())
    _run_generator(draft, draft_id, folder, mode)

    if not requested_file.exists():
        raise GeneratorError("Генератор отработал, но файл не появился")

    (folder / REPORT_HASH_NAME).write_text(current_hash, encoding="utf-8")
    return ReportResult(filename=requested_file.name, from_cache=False)
