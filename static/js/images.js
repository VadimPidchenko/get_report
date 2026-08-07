// Добавление и удаление картинок: выбор файла, перетаскивание, отмена удаления.

import * as api from "./api.js";
import { byId, closestElement, escapeHtml } from "./dom.js";
import { currentDraft, ensureDraftId, itemsOf, scheduleSave } from "./state.js";
import { render } from "./render.js";
import { showToast } from "./notifications.js";

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g)$/i;
const FIELD_ERROR_TIMEOUT_MS = 5000;
const DELETE_UNDO_TIMEOUT_MS = 3000;

/** Куда прикрепить выбранные через диалог файлы. */
let pendingTarget = null;

/** Открывает системный выбор файла для конкретного поля. */
export function pickImageFile(itemType, itemIndex, fieldName) {
  pendingTarget = { itemType, itemIndex, fieldName };
  byId("fileInput").click();
}

/** Подсвечивает поле красным и показывает причину отказа. */
function showFieldError({ itemType, itemIndex, fieldName }, message) {
  const dropzone = byId(`dz-${itemType}-${itemIndex}-${fieldName}`);
  if (!dropzone) return;

  dropzone.classList.add("err");
  const errorBox = dropzone.querySelector(".dz-error");
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  setTimeout(() => {
    dropzone.classList.remove("err");
    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }
  }, FIELD_ERROR_TIMEOUT_MS);
}

/** Поле, которому принадлежит зона загрузки. */
const dropzoneTarget = (dropzone) => ({
  itemType: dropzone.dataset.type,
  itemIndex: Number(dropzone.dataset.i),
  fieldName: dropzone.dataset.field,
});

const isImageFile = (file) =>
  IMAGE_EXTENSION_PATTERN.test(file.name || "") || (file.type || "").startsWith("image/");

/** Загружает файлы и прикрепляет их к полю. */
async function uploadAndAttach(files, target) {
  if (!target || !files.length) return;

  // картинки лежат в папке черновика, поэтому сначала нужен его id
  const draftId = await ensureDraftId();
  if (!draftId) {
    showFieldError(target, "Не удалось сохранить черновик");
    return;
  }

  let attachedCount = 0;
  let hasRejected = false;

  for (const file of files) {
    if (!isImageFile(file)) {
      hasRejected = true;
      continue;
    }

    try {
      const { saved } = await api.uploadImage(draftId, file);
      itemsOf(target.itemType)[target.itemIndex][target.fieldName].push({
        file: saved,
        caption: "",
      });
      attachedCount += 1;
    } catch (error) {
      hasRejected = true;
    }
  }

  if (attachedCount) {
    render();
    scheduleSave();
  }

  if (hasRejected) {
    showFieldError(target, "Некорректный формат. Разрешены только PNG и JPG.");
  }
}

/** Удаляет картинку из поля и с диска, оставляя возможность вернуть. */
export async function removeImage(itemType, itemIndex, fieldName, imageIndex) {
  const image = itemsOf(itemType)[itemIndex][fieldName][imageIndex];
  const draftId = currentDraft._id;

  itemsOf(itemType)[itemIndex][fieldName].splice(imageIndex, 1);
  render();
  scheduleSave();

  if (!draftId || !image) return;

  let backup = null;
  try {
    const response = await api.deleteImage(draftId, image.file);
    backup = response.data;
  } catch (error) {
    // файла уже нет — отменять нечего, уведомление всё равно покажем
  }

  showToast("Изображение удалено", {
    timeout: DELETE_UNDO_TIMEOUT_MS,
    onUndo: async () => {
      if (backup) await api.restoreImage(draftId, image.file, backup);

      const targetList = itemsOf(itemType)[itemIndex]?.[fieldName];
      if (targetList) {
        targetList.splice(Math.min(imageIndex, targetList.length), 0, image);
        render();
        scheduleSave();
      }
    },
  });
}

/** Меняет подпись к картинке. */
export function editCaption(itemType, itemIndex, fieldName, imageIndex) {
  const image = itemsOf(itemType)[itemIndex][fieldName][imageIndex];
  const caption = prompt("Подпись к изображению:", image.caption || "");
  if (caption === null) return;

  image.caption = caption;
  render();
  scheduleSave();
}

/** Расширение по типу картинки: из буфера файл приходит без осмысленного имени. */
const CLIPBOARD_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * Даёт вставленной картинке имя.
 *
 * Буфер отдаёт файл, который во всех вставках зовётся одинаково, — из-за этого
 * два скриншота подряд рискуют перетереть друг друга. Метка времени разводит их.
 * Формат не из списка отдаём как есть: его отсеет общая проверка.
 */
function nameClipboardFile(file, index) {
  const extension = CLIPBOARD_EXTENSIONS[file.type];
  if (!extension) return file;

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new File([file], `paste-${stamp}-${index + 1}.${extension}`, { type: file.type });
}

/**
 * Вставка картинки из буфера.
 *
 * Куда вставлять — определяет фокус: кликнутая зона подсвечивается и ловит
 * Ctrl+V. Отдельного «выделения» не заводим, иначе его пришлось бы сбрасывать
 * руками при каждой перерисовке карточек.
 *
 * Вставка текста не страдает: если картинок в буфере нет, событие идёт дальше.
 */
export function initPasteImages() {
  document.addEventListener("paste", async (event) => {
    const dropzone = closestElement(document.activeElement, ".dropzone");
    if (!dropzone) return;

    const images = [...(event.clipboardData?.files || [])]
      .filter((file) => (file.type || "").startsWith("image/"))
      .map(nameClipboardFile);
    if (!images.length) return;

    event.preventDefault();

    const target = dropzoneTarget(dropzone);
    await uploadAndAttach(images, target);

    // перерисовка заменила зону новой — возвращаем фокус, чтобы можно было
    // вставить следующий скриншот, не кликая заново
    byId(`dz-${target.itemType}-${target.itemIndex}-${target.fieldName}`)?.focus();
  });
}

/**
 * Перетаскивание файлов.
 *
 * Обработчики висят на документе: карточки перерисовываются целиком,
 * и навешивать слушатели на каждую зону заново было бы лишней работой.
 */
export function initDragAndDrop() {
  document.addEventListener("dragover", (event) => {
    const dropzone = closestElement(event.target, ".dropzone");
    if (!dropzone) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    dropzone.classList.add("drag");
  });

  document.addEventListener("dragleave", (event) => {
    const dropzone = closestElement(event.target, ".dropzone");
    if (dropzone && !dropzone.contains(event.relatedTarget)) {
      dropzone.classList.remove("drag");
    }
  });

  document.addEventListener("drop", async (event) => {
    const dropzone = closestElement(event.target, ".dropzone");
    if (!dropzone) return;

    event.preventDefault();
    dropzone.classList.remove("drag");

    // файлы забираем синхронно: после await событие уже недоступно
    const files = [...event.dataTransfer.files];
    await uploadAndAttach(files, dropzoneTarget(dropzone));
  });

  // промах мимо зоны не должен открывать файл в новой вкладке
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    if (!closestElement(event.target, ".dropzone")) event.preventDefault();
  });

  byId("fileInput").onchange = async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    await uploadAndAttach(files, pendingTarget);
  };
}
