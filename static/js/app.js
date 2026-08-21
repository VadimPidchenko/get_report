// Точка входа: запуск приложения и связывание модулей.

import * as api from "./api.js";
import {
    byId,
    autoGrowTextarea,
    autoGrowAllTextareas,
} from "./dom.js";
import {
  currentDraft,
  setCurrentDraft,
  cleanupEmptyListItems,
} from "./state.js";
import { scheduleSave, onDraftSaved } from "./draft-persistence.js";
import {
  getLastDraftId,
  getOpenDraftId,
  forgetLastDraft,
  forgetOpenDraft,
} from "./draft-session.js";
import {
  render,
  syncHeader,
  onAfterRender,
  setResumeCandidate,
  clearResumeCandidate,
  getResumeCandidate,
  statusClass,
} from "./render.js";
import {
  refreshDraftList,
  openSidebar,
  closeSidebar,
  openDraft,
  startNewDraft,
  renameDraft,
  deleteDraft,
  toggleDraftMenu,
  closeDraftMenus,
  renameCurrentDraft,
} from "./drafts.js";
import {
  initDragAndDrop,
  initPasteImages,
  pickImageFile,
  removeImage,
  editCaption,
} from "./images.js";
import {
  initDownloadButtons,
  refreshDownloadButtons,
  clearFieldError,
} from "./reports.js";
import { initDialogs } from "./dialogs.js";
import {
  updateField,
  updateListItem,
  addListItem,
  removeListItem,
  addItem,
  removeItem,
} from "./editor.js";

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

function initProjectDropdown() {
  const trigger = byId("projectTrigger");
  const dropdown = byId("projectDropdown");

  trigger.onclick = (event) => {
    event.stopPropagation();
    if (dropdown.classList.contains("open")) closeProjectDropdown();
    else openProjectDropdown();
  };

  byId("projectOptions").onclick = (event) => {
    const option = event.target.closest(".project-option");
    if (!option) return;
    event.stopPropagation();
    chooseProject(option.dataset.value);
  };

  trigger.onkeydown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openProjectDropdown();
    const options = [...dropdown.querySelectorAll(".project-option:not([disabled])")];
    const selected = dropdown.querySelector(".project-option.selected");
    const index = Math.max(0, options.indexOf(selected));
    const target = event.key === "ArrowUp" ? options[Math.max(0, index - 1)] : options[Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : 0))];
    (target || selected || options[0])?.focus();
  };

  byId("projectOptions").onkeydown = (event) => {
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
  };
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
function toggleStatusDropdown(dropdown, event) {
  event.stopPropagation();
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
function chooseStatus(itemType, itemIndex, status, option, event) {
  event.stopPropagation();
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

function initStatusDropdowns() {
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

// ─── восстановление прошлой работы ───

async function resumeLastDraft() {
  const candidate = getResumeCandidate();
  if (!candidate) return;

  clearResumeCandidate();
  await openDraft(candidate._id);
}

function dismissResumeBar() {
  clearResumeCandidate();
  render();
}

/**
 * Разметка карточек собирается строками, поэтому обработчики в атрибутах
 * ищут функции в глобальной области. Публикуем только то, что там нужно.
 */
function exposeInlineHandlers() {
  // часть обработчиков вызывается только из onclick в строках разметки —
  // анализатор их не видит и считает неиспользуемыми
  // noinspection JSUnusedGlobalSymbols
  Object.assign(window, {
    updateField,
    toggleStatusDropdown,
    chooseStatus,
    addItem,
    removeItem,
    pickImageFile,
    removeImage,
    editCaption,
    clearFieldError,
    openDraft,
    renameDraft,
    deleteDraft,
    toggleDraftMenu,
    resumeLastDraft,
    dismissResumeBar,
    updateListItem,
    addListItem,
    removeListItem,
  });
}

// ─── обработчики интерфейса ───

const ACTIVE_TAB_STORAGE_KEY = "activeTab";

/** Показывает нужную вкладку и запоминает выбор до конца сессии. */
function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  const isCasesTab = tabName === "cases";
  byId("casesPane").style.display = isCasesTab ? "" : "none";
  byId("bugsPane").style.display = isCasesTab ? "none" : "";

  sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabName);

  // панель рисовалась скрытой, а у скрытой scrollHeight = 0 —
  // высоту textarea можно посчитать только сейчас, когда она видима
  autoGrowAllTextareas();
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      activateTab(tab.dataset.tab);
      window.scrollTo(0, 0);
    };
  });
}

function initHeaderFields() {
  const fieldToProperty = { project: "project", date: "date", jira: "jira_base" };

  Object.entries(fieldToProperty).forEach(([elementId, property]) => {
    byId(elementId).oninput = (event) => {
      currentDraft[property] = event.target.value;
      scheduleSave();
    };
  });

  byId("draftName").onclick = () => renameCurrentDraft();
}

function initSidebar() {
  byId("burger").onclick = () => {
    const isOpen = byId("sidebar").classList.contains("open");
    if (isOpen) closeSidebar(); else openSidebar();
  };
  byId("backdrop").onclick = closeSidebar;
  byId("newDraftBtn").onclick = startNewDraft;
}

function initAutoGrow() {
  document.addEventListener("input", (event) => {
    if (event.target?.tagName === "TEXTAREA") autoGrowTextarea(event.target);
  });
}

const SCROLL_STORAGE_KEY = "report_app_scroll";

/** Запоминает позицию прокрутки перед уходом со страницы. */
function initScrollMemory() {
  // браузер восстанавливает прокрутку сам, но к тому моменту страница ещё пуста —
  // забираем это на себя, чтобы он не мешал
  history.scrollRestoration = "manual";

  window.addEventListener("beforeunload", () => {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
  });
}

/** Возвращает прокрутку туда, где она была до перезагрузки. */
function restoreScroll() {
  const saved = Number(sessionStorage.getItem(SCROLL_STORAGE_KEY));
  if (!saved) return;

  // textarea растягиваются в render(), высота страницы меняется —
  // прокручиваем следующим кадром, когда раскладка уже посчитана
  requestAnimationFrame(() => window.scrollTo(0, saved));
}

/**
 * Готовит начальное состояние.
 *
 * Перезагрузка вкладки возвращает открытый черновик — но только если его
 * действительно открывали. Иначе остаётся чистый лист и предложение продолжить.
 */
async function restoreInitialDraft() {
  const openDraftId = getOpenDraftId();

  if (openDraftId) {
    try {
      setCurrentDraft(await api.fetchDraft(openDraftId));
      cleanupEmptyListItems(currentDraft);
      return;
    } catch (error) {
      forgetOpenDraft();
    }
  }

  // ничего не открывали — предлагаем вернуться к прошлому черновику, если он непустой
  const lastDraftId = getLastDraftId();
  if (lastDraftId) {
    try {
      const draft = await api.fetchDraft(lastDraftId);
      const hasContent = (draft.cases || []).length || (draft.bugs || []).length;
      if (hasContent) setResumeCandidate(draft);
    } catch (error) {
      forgetLastDraft();
    }
  }

  const blank = await api.fetchEmptyDraft();
  setCurrentDraft(blank);
  currentDraft._id = null;
  currentDraft._title = null;
}

async function init() {
  exposeInlineHandlers();
  initTabs();
  initHeaderFields();
  initProjectDropdown();
  initDialogs();
  initSidebar();
  initAutoGrow();
  initStatusDropdowns();
  initScrollMemory();
  initDragAndDrop();
  initPasteImages();
  initDownloadButtons();

  onAfterRender(refreshDownloadButtons);
  onDraftSaved(refreshDraftList);

  await restoreInitialDraft();

  // вкладку восстанавливаем до render(): autoGrow не умеет считать высоту
  // у скрытой панели, поэтому нужная вкладка должна быть уже видима
  activateTab(sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || "cases");

  syncHeader();
  render();
  restoreScroll();
  await refreshDraftList();
}

void init();
