"""HTTP-эндпоинты для работы с черновиками."""

from fastapi import APIRouter, HTTPException

from app.services import drafts as drafts_service

router = APIRouter(prefix="/api", tags=["drafts"])


@router.get("/empty")
def get_empty_draft():
    """Заготовка нового черновика — фронт 123 открывает её при старте."""
    return drafts_service.build_empty_draft()


@router.get("/drafts")
def get_drafts():
    """Список черновиков для боковой панели."""
    return {"drafts": drafts_service.list_drafts()}


@router.get("/draft/{draft_id}")
def get_draft(draft_id: str):
    if not drafts_service.draft_exists(draft_id):
        raise HTTPException(404, "Черновик не найден")
    return drafts_service.read_draft(draft_id)


@router.post("/draft")
async def save_draft(draft: dict):
    """Автосохранение. Новый черновик получает id и название."""
    saved = drafts_service.write_draft(draft)
    return {"id": saved["_id"], "title": saved["_title"]}


@router.post("/draft/{draft_id}/rename")
async def rename_draft(draft_id: str, body: dict):
    if not drafts_service.draft_exists(draft_id):
        raise HTTPException(404, "Черновик не найден")
    title = drafts_service.rename_draft(draft_id, body.get("title", ""))
    return {"ok": True, "title": title}


@router.delete("/draft/{draft_id}")
def delete_draft(draft_id: str):
    """Удаляет черновик вместе с картинками и отчётами."""
    drafts_service.delete_draft(draft_id)
    return {"ok": True}
