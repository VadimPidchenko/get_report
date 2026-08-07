// Всплывающие уведомления и статусная строка.

import { byId } from "./dom.js";

const DEFAULT_TIMEOUT_MS = 5000;

/** Текст в нижней панели рядом с кнопками скачивания. */
export function setStatusMessage(text, clearAfterMs = 0) {
  byId("statusMsg").textContent = text;
  if (clearAfterMs) {
    setTimeout(() => {
      if (byId("statusMsg").textContent === text) byId("statusMsg").textContent = "";
    }, clearAfterMs);
  }
}

/**
 * Показывает уведомление в правом верхнем углу.
 * Уведомления складываются стопкой, каждое живёт своим таймером.
 * @param {string} html
 * @param {{timeout?: number, onUndo?: (() => void|Promise<void>)|null}} [options]
 */
export function showToast(html, { timeout = DEFAULT_TIMEOUT_MS, onUndo = null } = {}) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span class="t">${html}</span>`;

  const close = () => {
    clearTimeout(timer);
    toast.remove();
  };

  if (onUndo) {
    const undoButton = document.createElement("button");
    undoButton.className = "undo";
    undoButton.textContent = "Отменить";
    undoButton.onclick = () => {
      onUndo();
      close();
    };
    toast.appendChild(undoButton);
  }

  const timer = setTimeout(close, timeout);
  byId("toasts").appendChild(toast);
}
