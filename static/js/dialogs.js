// Единый dialog primitive для ввода текста и подтверждений.

import { byId } from "./dom.js";

let activeResolve = null;
let previousFocus = null;
let shouldRestoreFocus = true;

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function layer() { return byId("dialogLayer"); }
function dialog() { return byId("dialog"); }

function closeDialog(result) {
  if (!activeResolve) return;

  const resolve = activeResolve;
  activeResolve = null;

  layer().classList.add("closing");
  layer().setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    layer().classList.remove("open", "closing", "danger");
    document.body.classList.remove("dialog-open");
    if (shouldRestoreFocus) previousFocus?.focus?.({ preventScroll: true });
    else previousFocus?.blur?.();
    previousFocus = null;
    shouldRestoreFocus = true;
    resolve(result);
  }, 200);
}

function handleKeydown(event) {
  if (!layer().classList.contains("open")) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog(null);
    return;
  }

  if (event.key === "Tab") {
    const focusable = [...dialog().querySelectorAll(focusableSelector)]
      .filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function configure({
  title,
  description = "",
  value = "",
  inputLabel = "Название",
  confirmLabel = "Сохранить",
  danger = false,
  input = true,
  required = false,
}) {
  byId("dialogTitle").textContent = title;
  byId("dialogDescription").textContent = description;
  byId("dialogDescription").hidden = !description;

  byId("dialogField").hidden = !input;
  byId("dialogInputLabel").textContent = inputLabel;
  byId("dialogInput").value = value;
  byId("dialogInput").classList.remove("invalid");
  byId("dialogError").textContent = "";

  const confirm = byId("dialogConfirm");
  confirm.textContent = confirmLabel;
  confirm.classList.toggle("danger", danger);

  layer().classList.toggle("danger", danger);

  confirm.onclick = () => {
    if (!input) {
      closeDialog(true);
      return;
    }

    const text = byId("dialogInput").value.trim();
    if (required && !text) {
      byId("dialogInput").classList.add("invalid");
      byId("dialogError").textContent = "Обязательное поле";
      byId("dialogInput").focus();
      return;
    }
    closeDialog(text);
  };

  byId("dialogCancel").onclick = () => closeDialog(null);
  layer().querySelector("[data-dialog-cancel]").onclick = () => closeDialog(null);

  byId("dialogInput").oninput = () => {
    byId("dialogInput").classList.remove("invalid");
    byId("dialogError").textContent = "";
  };

  byId("dialogInput").onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirm.click();
    }
  };
}

function openDialog(options) {
  if (activeResolve) closeDialog(null);

  previousFocus = document.activeElement;
  shouldRestoreFocus = options.restoreFocus !== false;
  configure(options);
  document.body.classList.add("dialog-open");
  layer().classList.remove("closing");
  layer().classList.add("open");
  layer().setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    if (options.input !== false) {
      const input = byId("dialogInput");
      input.focus();
      input.select();
    } else {
      byId("dialogCancel").focus();
    }
  });

  return new Promise((resolve) => { activeResolve = resolve; });
}

export function initDialogs() {
  document.addEventListener("keydown", handleKeydown);
}

export const askText = (options) => openDialog({ ...options, input: true });

export const confirmAction = (options) => openDialog({
  ...options,
  input: false,
  danger: options.danger ?? true,
});
