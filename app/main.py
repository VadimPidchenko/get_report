"""Точка входа приложения.

Запуск из корня проекта:
    uvicorn app.main:app --reload --port 8000

Интерфейс открывается на http://127.0.0.1:8000
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import STATIC_DIR
from app.routes import drafts, images, reports
from app.storage.paths import InvalidStoragePath
from app.storage.workspace import ensure_workspace_directories

ensure_workspace_directories()

app = FastAPI(title="Сборка отчётов о тестировании")


@app.exception_handler(InvalidStoragePath)
async def invalid_storage_path_handler(
    _request: Request,
    error: InvalidStoragePath,
) -> JSONResponse:
    """Не пропускает запросы за границы локального workspace."""
    return JSONResponse(status_code=400, content={"detail": str(error)})

app.include_router(drafts.router)
app.include_router(images.router)
app.include_router(reports.router)

# статика монтируется последней, чтобы не перехватывать /api/*
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
