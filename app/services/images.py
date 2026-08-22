"""Хранение картинок черновика.

Картинки лежат в images/{draft_id}/. Опустевшая папка удаляется,
чтобы каталог не зарастал пустыми директориями.
"""

import base64
from pathlib import Path

from app.config import ALLOWED_IMAGE_EXTENSIONS
from app.storage.files import (
    ensure_directory,
    remove_directory_if_empty,
    remove_file_if_exists,
)
from app.storage.paths import draft_images_path, image_file_path


def image_path(draft_id: str, filename: str) -> Path:
    """Возвращает путь к изображению, не создавая каталогов."""
    return image_file_path(draft_id, filename)


def is_allowed_extension(filename: str | None) -> bool:
    if not filename:
        return False
    return Path(filename).suffix.lower() in ALLOWED_IMAGE_EXTENSIONS


def _pick_free_filename(draft_id: str, filename: str) -> str:
    """Подбирает свободное имя: file.png, file_1.png, file_2.png…"""
    candidate = image_file_path(draft_id, filename)
    if not candidate.exists():
        return filename

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    counter = 1
    while image_file_path(draft_id, f"{stem}_{counter}{suffix}").exists():
        counter += 1
    return f"{stem}_{counter}{suffix}"


def _normalize_image_file(path: Path) -> None:
    """Приводит картинку к настоящему PNG, если формат не PNG и не JPEG.

    Скриншоты на самом деле могут быть одного формата, а расширение ставят .png. Такой файл
    может весить больше и может некорректно вставиться в docx. Пересохранение
    выполняется без потерь — качество не меняется.
    """
    try:
        from PIL import Image
    except ImportError:
        return  # Pillow не установлен — оставляем файл как есть

    try:
        with Image.open(path) as opened:
            if opened.format in ("PNG", "JPEG"):
                return
            converted = opened.convert("RGB")
        converted.save(path, "PNG", optimize=True)
    except Exception:
        pass  # битый или нечитаемый файл не должен ломать загрузку


def save_image(draft_id: str, filename: str, content: bytes) -> str:
    """Сохраняет картинку и возвращает итоговое имя файла."""
    ensure_directory(draft_images_path(draft_id))
    final_name = _pick_free_filename(draft_id, filename)
    destination = image_file_path(draft_id, final_name)
    destination.write_bytes(content)
    _normalize_image_file(destination)
    return final_name


def delete_image(draft_id: str, filename: str) -> str | None:
    """Удаляет картинку и возвращает её содержимое в base64 для отмены.

    Если после удаления папка опустела — убирает и её.
    """
    folder = draft_images_path(draft_id)
    path = image_file_path(draft_id, filename)
    if not path.exists():
        return None

    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    remove_file_if_exists(path)
    remove_directory_if_empty(folder)

    return encoded


def restore_image(draft_id: str, filename: str, encoded_content: str) -> None:
    """Возвращает удалённую картинку на место (кнопка «Отменить»)."""
    ensure_directory(draft_images_path(draft_id))
    image_file_path(draft_id, filename).write_bytes(base64.b64decode(encoded_content))
