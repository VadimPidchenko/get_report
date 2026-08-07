"""Хранение картинок черновика.

Картинки лежат в images/{draft_id}/. Опустевшая папка удаляется,
чтобы каталог не зарастал пустыми директориями.
"""

import base64
from pathlib import Path

from app.config import ALLOWED_IMAGE_EXTENSIONS, IMAGES_DIR


def images_dir(draft_id: str) -> Path:
    """Папка картинок черновика, создаётся при первом обращении."""
    folder = IMAGES_DIR / draft_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def image_path(draft_id: str, filename: str) -> Path:
    return IMAGES_DIR / draft_id / filename


def is_allowed_extension(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_IMAGE_EXTENSIONS


def pick_free_filename(folder: Path, filename: str) -> str:
    """Подбирает свободное имя: file.png, file_1.png, file_2.png…"""
    candidate = folder / filename
    if not candidate.exists():
        return filename

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    counter = 1
    while (folder / f"{stem}_{counter}{suffix}").exists():
        counter += 1
    return f"{stem}_{counter}{suffix}"


def normalize_to_png(path: Path) -> None:
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
    folder = images_dir(draft_id)
    final_name = pick_free_filename(folder, filename)
    destination = folder / final_name
    destination.write_bytes(content)
    normalize_to_png(destination)
    return final_name


def delete_image(draft_id: str, filename: str) -> str | None:
    """Удаляет картинку и возвращает её содержимое в base64 для отмены.

    Если после удаления папка опустела — убирает и её.
    """
    folder = IMAGES_DIR / draft_id
    path = folder / filename
    if not path.exists():
        return None

    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    path.unlink()

    try:
        if folder.exists() and not any(folder.iterdir()):
            folder.rmdir()
    except OSError:
        pass  # папку удалить не удалось — не критично

    return encoded


def restore_image(draft_id: str, filename: str, encoded_content: str) -> None:
    """Возвращает удалённую картинку на место (кнопка «Отменить»)."""
    folder = images_dir(draft_id)
    (folder / filename).write_bytes(base64.b64decode(encoded_content))
