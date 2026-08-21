// Точка входа: запуск приложения и связывание модулей.

import * as api from "./api.js";
import {
  currentDraft,
  setCurrentDraft,
  cleanupEmptyListItems,
} from "./state.js";
import { onDraftSaved } from "./draft-persistence.js";
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
} from "./render.js";
import {
  refreshDraftList,
  initDraftEvents,
} from "./drafts.js";
import { initImageEvents } from "./images.js";
import {
  initDownloadButtons,
  refreshDownloadButtons,
  initValidationEvents,
} from "./reports.js";
import { initDialogs } from "./dialogs.js";
import { initEditorEvents } from "./editor.js";
import {
  initProjectDropdown,
  initStatusDropdowns,
} from "./dropdowns.js";
import {
  initTabs,
  initScrollMemory,
  restoreSavedTab,
  restoreScroll,
} from "./view-session.js";

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
  initTabs();
  initEditorEvents();
  initProjectDropdown();
  initDialogs();
  initDraftEvents();
  initStatusDropdowns();
  initValidationEvents();
  initScrollMemory();
  initImageEvents();
  initDownloadButtons();

  onAfterRender(refreshDownloadButtons);
  onDraftSaved(refreshDraftList);

  await restoreInitialDraft();

  // вкладку восстанавливаем до render(): autoGrow не умеет считать высоту
  // у скрытой панели, поэтому нужная вкладка должна быть уже видима
  restoreSavedTab();

  syncHeader();
  render();
  restoreScroll();
  await refreshDraftList();
}

void init();
