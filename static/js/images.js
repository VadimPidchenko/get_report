// Добавление и удаление картинок: выбор файла, перетаскивание, отмена удаления.

import * as api from "./api.js";
import { byId, closestElement, escapeHtml } from "./dom.js";
import { currentDraft, ensureDraftId, itemsOf, scheduleSave } from "./state.js";
import { showToast } from "./notifications.js";
import { askText } from "./dialogs.js";

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g)$/i;
const FIELD_ERROR_TIMEOUT_MS = 5000;
const DELETE_UNDO_TIMEOUT_MS = 3000;

/** Разметка одного превью. Используется для точечного обновления DOM без полного render(). */
function shotMarkup(image, itemType, itemIndex, fieldName, imageIndex) {
  const draftId = currentDraft._id;
  return `
    <div class="shot">
      <button class="x" onclick="removeImage('${itemType}',${itemIndex},'${fieldName}',${imageIndex})">×</button>
      <img src="${draftId ? api.imageUrl(draftId, image.file) : ""}" alt="">
      <button type="button" class="cap ${image.caption ? "" : "empty"}"
           data-image-index="${imageIndex}"
           onclick="event.stopPropagation(); editCaption('${itemType}',${itemIndex},'${fieldName}',${imageIndex})">
        ${image.caption ? escapeHtml(image.caption) : "+ подпись"}
      </button>
    </div>`;
}

/** Возвращает контейнер превью конкретного image-field. */
function shotsContainer(itemType, itemIndex, fieldName) {
  return byId(`dz-${itemType}-${itemIndex}-${fieldName}`)?.querySelector(".shots") || null;
}

/**
 * После вставки/удаления картинки обновляет только индексы следующих превью.
 * Сами <img> не пересоздаются, поэтому соседние изображения не мигают.
 */
function reindexShots(itemType, itemIndex, fieldName) {
  const shots = shotsContainer(itemType, itemIndex, fieldName);
  if (!shots) return false;

  [...shots.querySelectorAll(".shot")].forEach((shot, imageIndex) => {
    const removeButton = shot.querySelector(".x");
    if (removeButton) {
      removeButton.setAttribute(
        "onclick",
        `removeImage('${itemType}',${itemIndex},'${fieldName}',${imageIndex})`,
      );
    }

    const captionButton = shot.querySelector(".cap");
    if (captionButton) {
      captionButton.dataset.imageIndex = String(imageIndex);
      captionButton.setAttribute(
        "onclick",
        `event.stopPropagation(); editCaption('${itemType}',${itemIndex},'${fieldName}',${imageIndex})`,
      );
    }
  });
  return true;
}

/** Добавляет в DOM только новые превью, не затрагивая уже существующие картинки. */
function appendShots(target, images, startIndex) {
  const shots = shotsContainer(target.itemType, target.itemIndex, target.fieldName);
  const addButton = shots?.querySelector(".add-shot");
  if (!shots || !addButton) return false;

  images.forEach((image, offset) => {
    addButton.insertAdjacentHTML(
      "beforebegin",
      shotMarkup(image, target.itemType, target.itemIndex, target.fieldName, startIndex + offset),
    );
  });
  return true;
}

/** Удаляет из DOM только одно превью. */
function removeShotNode(itemType, itemIndex, fieldName, imageIndex) {
  const shots = shotsContainer(itemType, itemIndex, fieldName);
  const shot = shots?.querySelectorAll(".shot")[imageIndex];
  if (!shot) return false;
  shot.remove();
  reindexShots(itemType, itemIndex, fieldName);
  return true;
}

/** Возвращает удалённое превью на прежнюю позицию без перерисовки соседей. */
function restoreShotNode(itemType, itemIndex, fieldName, imageIndex, image) {
  const shots = shotsContainer(itemType, itemIndex, fieldName);
  const addButton = shots?.querySelector(".add-shot");
  if (!shots || !addButton) return false;

  const existing = shots.querySelectorAll(".shot");
  const before = existing[imageIndex] || addButton;
  before.insertAdjacentHTML(
    "beforebegin",
    shotMarkup(image, itemType, itemIndex, fieldName, imageIndex),
  );
  reindexShots(itemType, itemIndex, fieldName);
  return true;
}

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

  const targetImages = itemsOf(target.itemType)[target.itemIndex][target.fieldName];
  const firstNewIndex = targetImages.length;
  const attachedImages = [];
  let hasRejected = false;

  for (const file of files) {
    if (!isImageFile(file)) {
      hasRejected = true;
      continue;
    }

    try {
      const { saved } = await api.uploadImage(draftId, file);
      const image = { file: saved, caption: "" };
      targetImages.push(image);
      attachedImages.push(image);
    } catch (error) {
      hasRejected = true;
    }
  }

  if (attachedImages.length) {
    appendShots(target, attachedImages, firstNewIndex);
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
  removeShotNode(itemType, itemIndex, fieldName, imageIndex);
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
        const restoreIndex = Math.min(imageIndex, targetList.length);
        targetList.splice(restoreIndex, 0, image);
        restoreShotNode(itemType, itemIndex, fieldName, restoreIndex, image);
        scheduleSave();
      }
    },
  });
}

/** Меняет подпись к картинке. */
export async function editCaption(itemType, itemIndex, fieldName, imageIndex) {
  const image = itemsOf(itemType)[itemIndex][fieldName][imageIndex];
  const caption = await askText({
    title: "Изменить подпись",
    inputLabel: "Текст подписи",
    value: image.caption || "",
    confirmLabel: "Сохранить",
    restoreFocus: false,
  });
  if (caption === null) return;

  image.caption = caption;

  const dropzone = document.getElementById(`dz-${itemType}-${itemIndex}-${fieldName}`);
  const captionButton = dropzone?.querySelector(`.cap[data-image-index="${imageIndex}"]`);
  if (captionButton) {
    captionButton.textContent = caption || "+ подпись";
    captionButton.classList.toggle("empty", !caption);
    captionButton.blur();
  }

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

    // DOM зоны больше не пересоздаётся: сохраняем фокус, чтобы следующий
    // Ctrl+V можно было сделать без повторного клика.
    byId(`dz-${target.itemType}-${target.itemIndex}-${target.fieldName}`)?.focus();
  });
}

/**
 * Перетаскивание файлов.
 *
 * Обработчики висят на документе, поэтому работают и для динамически
 * добавленных карточек/зон без повторного навешивания слушателей.
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
