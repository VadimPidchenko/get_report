"""Запуск внешнего Node.js-генератора отчётов."""

import json
import os
import subprocess
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from pathlib import Path

from app.config import GENERATOR_SCRIPT, GENERATOR_TIMEOUT_SECONDS


class GeneratorError(RuntimeError):
    """Внешний генератор не смог собрать отчёт."""


@contextmanager
def _generator_data_file(draft: dict, mode: str) -> Iterator[Path]:
    """Готовит JSON для генератора и удаляет его после запуска."""
    if mode == "convert":
        yield Path(os.devnull)
        return

    data_file: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as temporary:
            data_file = Path(temporary.name)
            json.dump(draft, temporary, ensure_ascii=False)
        yield data_file
    finally:
        if data_file is not None:
            with suppress(OSError):
                data_file.unlink()


def _process_error_message(error: subprocess.CalledProcessError) -> str:
    """Добавляет к ошибке процесса доступный stderr или stdout."""
    details = (error.stderr or error.stdout or "").strip()
    if not details:
        return "Генератор завершился с ошибкой"
    return f"Генератор завершился с ошибкой:\n{details}"


def run_generator(
    draft: dict,
    images_dir: Path,
    output_dir: Path,
    mode: str,
) -> None:
    """Запускает Node.js-генератор в выбранном оркестратором режиме."""
    with _generator_data_file(draft, mode) as data_file:
        command = [
            "node",
            str(GENERATOR_SCRIPT),
            str(data_file),
            str(images_dir),
            str(output_dir),
            mode,
        ]

        try:
            subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=GENERATOR_TIMEOUT_SECONDS,
                check=True,
            )
        except FileNotFoundError as error:
            raise GeneratorError(
                "Node.js не найден — установите его, чтобы собирать отчёты"
            ) from error
        except subprocess.TimeoutExpired as error:
            raise GeneratorError("Генерация заняла слишком много времени") from error
        except subprocess.CalledProcessError as error:
            raise GeneratorError(_process_error_message(error)) from error
        except OSError as error:
            raise GeneratorError(f"Не удалось запустить генератор: {error}") from error
