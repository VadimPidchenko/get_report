"""Жизненный цикл каталогов и ресурсов локального workspace."""

from collections.abc import Iterator
from pathlib import Path

from app.config import DRAFTS_DIR, IMAGES_DIR, REPORTS_DIR
from app.storage.files import (
    ensure_directory,
    remove_file_if_exists,
    remove_tree_if_exists,
)
from app.storage.paths import (
    InvalidStoragePath,
    draft_file_path,
    draft_images_path,
    draft_reports_path,
)


def ensure_workspace_directories() -> None:
    """Создаёт корневые каталоги данных, если их ещё нет."""
    for directory in (DRAFTS_DIR, IMAGES_DIR, REPORTS_DIR):
        ensure_directory(directory)


def iter_draft_files() -> Iterator[Path]:
    """Перечисляет сохранённые JSON-файлы черновиков."""
    for file in DRAFTS_DIR.glob("*.json"):
        try:
            yield draft_file_path(file.stem)
        except InvalidStoragePath:
            # Не читаем ссылки и другие пути, уходящие из drafts/.
            continue


def delete_draft_resources(draft_id: str) -> None:
    """Удаляет JSON черновика и его каталоги изображений и отчётов."""
    remove_file_if_exists(draft_file_path(draft_id))
    remove_tree_if_exists(draft_images_path(draft_id), ignore_errors=True)
    remove_tree_if_exists(draft_reports_path(draft_id), ignore_errors=True)
