// Единый dialog primitive для ввода текста и подтверждений.

import { byId } from "./dom.js";

let activeResolve = null;
let previousFocus = null;
let shouldRestoreFocus = true;
let activeDismissResult = null;

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
    layer().classList.remove("open", "closing", "danger", "report-warning");
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
    closeDialog(activeDismissResult);
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
  items = [],
  note = "",
  value = "",
  inputLabel = "Название",
  checkboxLabel = "",
  cancelLabel = "Отмена",
  confirmLabel = "Сохранить",
  cancelResult = null,
  confirmResult = true,
  dismissResult = null,
  danger = false,
  variant = "default",
  input = true,
  required = false,
}) {
  byId("dialogTitle").textContent = title;
  byId("dialogDescription").textContent = description;
  byId("dialogDescription").hidden = !description;

  const list = byId("dialogList");
  list.replaceChildren();
  items.forEach(({ label, text }) => {
    const item = document.createElement("li");
    const itemLabel = document.createElement("span");
    const itemText = document.createElement("span");
    itemLabel.textContent = label;
    itemText.textContent = text;
    item.append(itemLabel, itemText);
    list.append(item);
  });
  list.hidden = items.length === 0;

  byId("dialogNote").textContent = note;
  byId("dialogNote").hidden = !note;

  byId("dialogField").hidden = !input;
  byId("dialogInputLabel").textContent = inputLabel;
  byId("dialogInput").value = value;
  byId("dialogInput").classList.remove("invalid");
  byId("dialogError").textContent = "";

  const checkboxField = byId("dialogCheckboxField");
  const checkbox = byId("dialogCheckbox");
  checkboxField.hidden = !checkboxLabel;
  byId("dialogCheckboxLabel").textContent = checkboxLabel;
  checkbox.checked = false;

  const confirm = byId("dialogConfirm");
  confirm.textContent = confirmLabel;
  confirm.classList.toggle("danger", danger);
  byId("dialogCancel").textContent = cancelLabel;

  layer().classList.toggle("danger", danger);
  layer().classList.toggle("report-warning", variant === "report-warning");
  activeDismissResult = dismissResult;

  const explicitResult = (action) => checkboxLabel
    ? { action, checkboxChecked: checkbox.checked }
    : action;

  confirm.onclick = () => {
    if (!input) {
      closeDialog(explicitResult(confirmResult));
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

  byId("dialogCancel").onclick = () => closeDialog(explicitResult(cancelResult));
  layer().querySelector("[data-dialog-cancel]").onclick = () => closeDialog(activeDismissResult);

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

  // Фокус ставим после того, как dialog уже попал в layout и начал открываться.
  // Два rAF делают поведение стабильным и при анимации модалки: для текстового
  // диалога курсор сразу в поле, а текущее значение выделено для быстрой замены.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (options.input !== false) {
        const input = byId("dialogInput");
        input.focus({ preventScroll: true });
        const end = input.value.length;
        input.setSelectionRange(end, end);
      } else {
        byId("dialogCancel").focus({ preventScroll: true });
      }
    });
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
