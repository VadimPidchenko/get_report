"""Хранение черновиков отчёта.

Каждый черновик — отдельный JSON-файл в drafts/, имя файла совпадает с его id.
Вместе с черновиком удаляются его картинки и готовые отчёты.
"""

import json
import shutil
import uuid
from datetime import date, datetime
from pathlib import Path

from app.config import (
    DEFAULT_JIRA_BASE,
    DRAFTS_DIR,
    IMAGES_DIR,
    REPORTS_DIR,
)


def build_empty_draft() -> dict:
    """Заготовка нового черновика: дата и трекер по умолчанию, проект — нет.

    Значения подставляются только здесь, при создании. Открытие черновика
    идёт через read_draft и ничего не дозаполняет: пустое поле остаётся пустым,
    раз его намеренно очистили.

    Проект не выбран специально — иначе отчёт молча уедет с чужим проектом,
    если о поле забыли. Пустое значение ловит проверка перед сборкой.
    """
    return {
        "project": "",
        "date": datetime.now().strftime("%d.%m.%Y"),
        "jira_base": DEFAULT_JIRA_BASE,
        "cases": [],
        "bugs": [],
    }


def draft_path(draft_id: str) -> Path:
    return DRAFTS_DIR / f"{draft_id}.json"


def draft_exists(draft_id: str) -> bool:
    return draft_path(draft_id).exists()


def read_draft(draft_id: str) -> dict:
    """Читает черновик с диска.

    Существование файла проверяется на уровне роутов — сюда попадает
    только запрос по-существующему id.
    """
    return json.loads(draft_path(draft_id).read_text(encoding="utf-8"))


def write_draft(draft: dict) -> dict:
    """Сохраняет черновик. Если id ещё нет — присваивает новый.

    Возвращает сохранённый черновик (уже с id и названием).
    """
    draft_id = draft.get("_id") or uuid.uuid4().hex[:12]
    draft["_id"] = draft_id
    if not draft.get("_title"):
        # без даты: она и так стоит в карточке сайдбара рядом с названием
        draft["_title"] = "Отчёт о тестировании"

    draft_path(draft_id).write_text(
        json.dumps(draft, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return draft


def rename_draft(draft_id: str, new_title: str) -> str:
    """Меняет название черновика, возвращает установленное значение."""
    draft = read_draft(draft_id)
    draft["_title"] = new_title
    draft_path(draft_id).write_text(
        json.dumps(draft, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return draft["_title"]


def delete_draft(draft_id: str) -> None:
    """Удаляет черновик вместе с его картинками и отчётами."""
    draft_path(draft_id).unlink(missing_ok=True)

    for folder in (IMAGES_DIR / draft_id, REPORTS_DIR / draft_id):
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)


def _report_day(raw) -> date | None:
    """Дата из шапки отчёта. Поле свободное — что не разобралось, считаем пустым."""
    try:
        return datetime.strptime(str(raw).strip(), "%d.%m.%Y").date()
    except (ValueError, TypeError):
        return None


def list_drafts() -> list[dict]:
    """Краткая сводка по всем черновикам для боковой панели.

    Порядок — по дате отчёта, свежие сверху; отчёты без даты уходят в конец.
    Дату ставят руками, поэтому правка старого отчёта не подбрасывает его
    наверх: место в списке меняется, только если поменяли саму дату.
    """
    summaries = []
    for file in DRAFTS_DIR.glob("*.json"):
        try:
            draft = json.loads(file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue  # повреждённый файл просто пропускаем

        summaries.append({
            "id": file.stem,
            "title": draft.get("_title") or draft.get("project") or file.stem,
            "updated": file.stat().st_mtime,
            "cases": len(draft.get("cases", [])),
            "bugs": len(draft.get("bugs", [])),
            # карточка помечает отчёт проектом, пустой проект значит черновик
            "project": draft.get("project", ""),
            # по ней сайдбар разбивает список на группы
            "date": draft.get("date", ""),
        })

    # внутри одного дня свежие сверху: другого признака порядка у нас нет
    summaries.sort(
        key=lambda item: (_report_day(item["date"]) or date.min, item["updated"]),
        reverse=True,
    )
    return summaries
