"""Безопасное построение путей внутри локального workspace."""

from pathlib import Path

from app.config import DRAFTS_DIR, IMAGES_DIR, REPORTS_DIR


class InvalidStoragePath(ValueError):
    """Сегмент пути может вывести операцию за границы workspace."""


def _safe_segment(value: str, label: str) -> str:
    """Проверяет один сегмент пути, не изменяя его имя."""
    if not isinstance(value, str) or not value:
        raise InvalidStoragePath(f"Некорректное значение: {label}")
    if value in {".", ".."} or "\x00" in value or "/" in value or "\\" in value:
        raise InvalidStoragePath(f"Некорректное значение: {label}")
    if Path(value).is_absolute():
        raise InvalidStoragePath(f"Некорректное значение: {label}")
    return value


def _path_inside(root: Path, *segments: str) -> Path:
    """Строит путь и дополнительно проверяет его границу."""
    path = root.joinpath(*segments)
    try:
        path.resolve(strict=False).relative_to(root.resolve(strict=False))
    except ValueError as error:
        raise InvalidStoragePath("Путь выходит за границы workspace") from error
    return path


def draft_file_path(draft_id: str) -> Path:
    draft_id = _safe_segment(draft_id, "id черновика")
    return _path_inside(DRAFTS_DIR, f"{draft_id}.json")


def draft_images_path(draft_id: str) -> Path:
    draft_id = _safe_segment(draft_id, "id черновика")
    return _path_inside(IMAGES_DIR, draft_id)


def image_file_path(draft_id: str, filename: str) -> Path:
    filename = _safe_segment(filename, "имя изображения")
    return _path_inside(draft_images_path(draft_id), filename)


def draft_reports_path(draft_id: str) -> Path:
    draft_id = _safe_segment(draft_id, "id черновика")
    return _path_inside(REPORTS_DIR, draft_id)


def report_file_path(draft_id: str, filename: str) -> Path:
    filename = _safe_segment(filename, "имя файла отчёта")
    return _path_inside(draft_reports_path(draft_id), filename)
