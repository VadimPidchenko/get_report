"""Конфигурация приложения и корневые пути workspace."""

from pathlib import Path

# корень проекта — на уровень выше пакета app/
BASE_DIR = Path(__file__).resolve().parent.parent

DRAFTS_DIR = BASE_DIR / "drafts"       # черновики отчётов (по JSON на каждый)
IMAGES_DIR = BASE_DIR / "images"       # изображения (по папке на черновик)
REPORTS_DIR = BASE_DIR / "reports"     # готовые docx/pdf (по папке на черновик)
STATIC_DIR = BASE_DIR / "static"       # frontend

GENERATOR_SCRIPT = BASE_DIR / "generator" / "generate_report.js"

# значения по умолчанию для нового черновика
DEFAULT_JIRA_BASE = "https://jira.a7-tech.local/browse/"

# разрешённые расширения загружаемых картинок
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}

# имена файлов отчёта внутри папки черновика
REPORT_DOCX_NAME = "otchet.docx"
REPORT_PDF_NAME = "otchet.pdf"
REPORT_HASH_NAME = ".hash"

# сколько ждать генератор, прежде чем считать её зависшей
GENERATOR_TIMEOUT_SECONDS = 30
