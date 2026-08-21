// Управление выпадающими списками проекта и статусов.

import { byId } from "./dom.js";
import { updateField } from "./editor.js";
import { clearFieldError } from "./reports.js";
import { statusClass } from "./render.js";
import { closeDraftMenus } from "./drafts.js";

function closeProjectDropdown() {
  const dropdown = byId("projectDropdown");
  dropdown?.classList.remove("open");
  byId("projectTrigger")?.setAttribute("aria-expanded", "false");
}

function openProjectDropdown() {
  const dropdown = byId("projectDropdown");
  if (!dropdown) return;
  closeStatusDropdowns();
  dropdown.classList.add("open");
  byId("projectTrigger")?.setAttribute("aria-expanded", "true");
}

function chooseProject(value, { focusTrigger = true } = {}) {
  const select = byId("project");
  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));

  const dropdown = byId("projectDropdown");
  dropdown.querySelector(".project-label").textContent = value || "—";
  dropdown.querySelectorAll(".project-option").forEach((option) => {
    const selected = option.dataset.value === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });

  clearFieldError(dropdown);
  closeProjectDropdown();
  if (focusTrigger) byId("projectTrigger")?.focus();
}

export function initProjectDropdown() {
  const trigger = byId("projectTrigger");
  const dropdown = byId("projectDropdown");

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (dropdown.classList.contains("open")) closeProjectDropdown();
    else openProjectDropdown();
  });

  byId("projectOptions").addEventListener("click", (event) => {
    const option = event.target.closest(".project-option");
    if (!option) return;
    event.stopPropagation();
    chooseProject(option.dataset.value);
  });

  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openProjectDropdown();
    const options = [...dropdown.querySelectorAll(".project-option:not([disabled])")];
    const selected = dropdown.querySelector(".project-option.selected");
    const index = Math.max(0, options.indexOf(selected));
    const target = event.key === "ArrowUp" ? options[Math.max(0, index - 1)] : options[Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : 0))];
    (target || selected || options[0])?.focus();
  });

  byId("projectOptions").addEventListener("keydown", (event) => {
    const options = [...dropdown.querySelectorAll(".project-option:not([disabled])")];
    const index = options.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      options[Math.max(0, Math.min(options.length - 1, index + delta))]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = document.activeElement.closest?.(".project-option");
      if (option) chooseProject(option.dataset.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeProjectDropdown();
      trigger.focus();
    }
  });
}

function closeStatusDropdowns(except = null) {
  document.querySelectorAll(".status-dropdown.open").forEach((dropdown) => {
    if (dropdown === except) return;
    dropdown.classList.remove("open");
    dropdown.querySelector(".status-trigger")?.setAttribute("aria-expanded", "false");
  });
}

/** Выбирает направление меню статуса так, чтобы оно не попадало под sticky footer. */
function positionStatusDropdown(dropdown) {
  const trigger = dropdown.querySelector(".status-trigger");
  const menu = dropdown.querySelector(".status-options");
  if (!trigger || !menu) return;

  dropdown.classList.remove("drop-up");
  const triggerRect = trigger.getBoundingClientRect();
  const footerTop = document.querySelector(".footbar")?.getBoundingClientRect().top ?? window.innerHeight;
  const menuHeight = menu.scrollHeight;
  const below = footerTop - triggerRect.bottom - 8;
  const above = triggerRect.top - 8;

  if (below < menuHeight && above > below) dropdown.classList.add("drop-up");
}

/** Открывает меню статуса и закрывает другое открытое меню. */
function toggleStatusDropdown(dropdown) {
  closeProjectDropdown();
  const willOpen = !dropdown.classList.contains("open");
  closeStatusDropdowns(dropdown);
  // Направление вычисляем ДО показа меню. Иначе при первом открытии меню успевает
  // отрисоваться снизу и в следующий кадр перепрыгнуть наверх, что выглядит как рывок карточки.
  if (willOpen) positionStatusDropdown(dropdown);
  dropdown.classList.toggle("open", willOpen);
  dropdown.querySelector(".status-trigger")?.setAttribute("aria-expanded", String(willOpen));
}

/** Выбирает статус, закрывает меню и снимает мышиный фокус с поля. */
function chooseStatus(itemType, itemIndex, status, option) {
  updateField(itemType, itemIndex, "status", status);

  const dropdown = option.closest(".status-dropdown");
  dropdown.classList.remove("open", "status-none", "status-passed", "status-done", "status-failed", "status-blocked", "status-in-progress", "status-skipped", "status-to-do", "status-backlog");
  dropdown.classList.add(`status-${statusClass(status)}`);
  dropdown.querySelector(".status-label").textContent = status || "Не выбран";
  dropdown.querySelector(".status-trigger").setAttribute("aria-expanded", "false");
  dropdown.querySelectorAll(".status-option").forEach((item) => {
    const selected = item === option;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-selected", String(selected));
  });

  clearFieldError(dropdown);
  dropdown.querySelector(".status-trigger")?.focus();
}

export function initStatusDropdowns() {
  const handleStatusClick = (event) => {
    const actionTarget = event.target.closest?.("[data-action]");
    if (!actionTarget) return;

    if (actionTarget.dataset.action === "toggle-status") {
      event.stopPropagation();
      const dropdown = actionTarget.closest(".status-dropdown");
      if (dropdown) toggleStatusDropdown(dropdown);
      return;
    }

    if (actionTarget.dataset.action === "choose-status") {
      const dropdown = actionTarget.closest(".status-dropdown");
      const card = actionTarget.closest(".card[data-item-type][data-item-index]");
      if (!dropdown || !card) return;

      event.stopPropagation();
      chooseStatus(
        card.dataset.itemType,
        Number(card.dataset.itemIndex),
        actionTarget.dataset.status,
        actionTarget,
      );
    }
  };

  [byId("casesPane"), byId("bugsPane")].forEach((pane) => {
    pane.addEventListener("click", handleStatusClick);
  });

  document.addEventListener("click", () => {
    closeStatusDropdowns();
    closeProjectDropdown();
    closeDraftMenus();
  });

  // Открытый popover не должен висеть поверх footer при прокрутке/изменении viewport.
  window.addEventListener("scroll", () => closeStatusDropdowns(), { passive: true });
  window.addEventListener("resize", () => closeStatusDropdowns(), { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openStatus = document.querySelector(".status-dropdown.open");
    const openProject = byId("projectDropdown")?.classList.contains("open");
    const openDraftMenu = document.querySelector(".draft-menu.open");
    if (openStatus) {
      closeStatusDropdowns();
      openStatus.querySelector(".status-trigger")?.focus();
    }
    if (openProject) {
      closeProjectDropdown();
      byId("projectTrigger")?.focus();
    }
    if (openDraftMenu) {
      const trigger = openDraftMenu.closest(".draft-item")?.querySelector(".draft-menu-trigger");
      closeDraftMenus();
      trigger?.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    const trigger = event.target.closest?.(".status-trigger");
    const option = event.target.closest?.(".status-option");
    const dropdown = event.target.closest?.(".status-dropdown");
    if (!dropdown || (!trigger && !option)) return;

    const options = [...dropdown.querySelectorAll(".status-option")];
    if (trigger && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      closeProjectDropdown();
      positionStatusDropdown(dropdown);
      dropdown.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      const selected = dropdown.querySelector(".status-option.selected");
      (selected || options[0])?.focus();
      return;
    }

    if (option && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const index = options.indexOf(option);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      options[Math.max(0, Math.min(options.length - 1, index + delta))]?.focus();
    }
  });
}
