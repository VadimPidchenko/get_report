"""Точка входа приложения.

Запуск из корня проекта:
    uvicorn app.main:app --reload --port 8000

Интерфейс открывается на http://127.0.0.1:8000
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import STATIC_DIR, ensure_directories
from app.routes import drafts, images, reports

ensure_directories()

app = FastAPI(title="Сборка отчётов о тестировании")

app.include_router(drafts.router)
app.include_router(images.router)
app.include_router(reports.router)

# статика монтируется последней, чтобы не перехватывать /api/*
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
