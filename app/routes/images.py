"""HTTP-эндпоинты для картинок черновика."""

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.services import images as images_service

router = APIRouter(prefix="/api", tags=["images"])


@router.post("/upload/{draft_id}")
async def upload_image(draft_id: str, file: UploadFile = File(...)):
    """Загружает картинку в папку черновика."""
    if not images_service.is_allowed_extension(file.filename):
        raise HTTPException(400, "Допустимы только PNG и JPG")

    saved_name = images_service.save_image(draft_id, file.filename, await file.read())
    return {"saved": saved_name}


@router.get("/screenshot/{draft_id}/{filename}")
def get_image(draft_id: str, filename: str):
    """Отдаёт картинку для превью в интерфейсе."""
    path = images_service.image_path(draft_id, filename)
    if not path.exists():
        raise HTTPException(404, "Картинка не найдена")
    return FileResponse(path)


@router.delete("/screenshot/{draft_id}/{filename}")
def delete_image(draft_id: str, filename: str):
    """Удаляет картинку и возвращает её копию для отмены действия."""
    encoded = images_service.delete_image(draft_id, filename)
    return {"ok": True, "data": encoded}


@router.post("/screenshot/{draft_id}/{filename}/restore")
async def restore_image(draft_id: str, filename: str, body: dict):
    """Возвращает удалённую картинку на место."""
    encoded = body.get("data")
    if not encoded:
        raise HTTPException(400, "Нет данных для восстановления")

    images_service.restore_image(draft_id, filename, encoded)
    return {"ok": True}
