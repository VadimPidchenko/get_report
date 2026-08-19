"""Общие низкоуровневые filesystem-операции."""

import json
import shutil
import uuid
from pathlib import Path


def ensure_directory(path: Path) -> Path:
    """Создаёт каталог и возвращает его путь."""
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_text_atomic(path: Path, content: str) -> None:
    """Атомарно заменяет текстовый файл через временный файл рядом."""
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as file:
            file.write(content)
        temporary.replace(path)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, data: dict) -> None:
    content = json.dumps(data, ensure_ascii=False, indent=2)
    write_text_atomic(path, content)


def remove_file_if_exists(path: Path) -> None:
    path.unlink(missing_ok=True)


def remove_tree_if_exists(path: Path, *, ignore_errors: bool = False) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=ignore_errors)


def remove_directory_if_empty(path: Path) -> None:
    """Удаляет каталог, только если он существует и пуст."""
    try:
        if path.exists() and not any(path.iterdir()):
            path.rmdir()
    except OSError:
        pass
