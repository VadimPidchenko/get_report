// Всплывающие уведомления и статусная строка.

import { byId } from "./dom.js";

const DEFAULT_TIMEOUT_MS = 5000;
const EXIT_MS = 180;
const MAX_TOASTS = 4;

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
 * Уведомления складываются стопкой; для error/warning доступно ручное закрытие.
 * @param {string} html
 * @param {{timeout?: number, onUndo?: (() => void|Promise<void>)|null, kind?: string, key?: string}} [options]
 */
export function showToast(html, { timeout = DEFAULT_TIMEOUT_MS, onUndo = null, kind = "", key = "" } = {}) {
  const container = byId("toasts");
  if (key) container.querySelectorAll(`.toast[data-toast-key="${key}"]`).forEach((item) => item.remove());
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`.trim();
  if (key) toast.dataset.toastKey = key;
  toast.innerHTML = `<span class="t">${html}</span>`;

  let timer = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), EXIT_MS);
  };

  if (onUndo) {
    const undoButton = document.createElement("button");
    undoButton.className = "undo";
    undoButton.textContent = "Отменить";
    undoButton.onclick = async () => {
      await onUndo();
      close();
    };
    toast.appendChild(undoButton);
  }

  if (kind === "error" || kind === "warning") {
    const closeButton = document.createElement("button");
    closeButton.className = "toast-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Закрыть уведомление");
    closeButton.textContent = "×";
    closeButton.onclick = close;
    toast.appendChild(closeButton);
  }

  container.appendChild(toast);
  while (container.children.length > MAX_TOASTS) container.firstElementChild?.remove();
  timer = setTimeout(close, timeout);
}
