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
import {
  initProjectDropdown,
  initStatusDropdowns,
  toggleStatusDropdown,
  chooseStatus,
} from "./dropdowns.js";

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
