// Боковая панель со списком черновиков и переключение между ними.

import * as api from "./api.js";
import { byId, escapeHtml } from "./dom.js";
import { draftBadge, formatDay } from "./draft-meta.js";
import {
  currentDraft,
  setCurrentDraft,
  isDraftEmpty,
  cleanupEmptyListItems,
  LAST_DRAFT_STORAGE_KEY,
  rememberOpenDraft,
  forgetOpenDraft,
  setAutosaveStatus,
} from "./state.js";
import { render, syncHeader, clearResumeCandidate } from "./render.js";
import { showToast } from "./notifications.js";

export function openSidebar() {
  byId("sidebar").classList.add("open");
  byId("backdrop").classList.add("show");
}

export function closeSidebar() {
  byId("sidebar").classList.remove("open");
  byId("backdrop").classList.remove("show");
}

function formatUpdatedAt(timestamp) {
  return new Date(timestamp * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Раскладывает список по дням.
 *
 * Черновики приходят отсортированными по дате отчёта, поэтому дни идут
 * подряд — достаточно сравнить с последней набранной группой.
 */
function groupByDay(drafts) {
  const groups = [];

  for (const draft of drafts) {
    const day = formatDay(draft.date);
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1).items.push(draft);
  }

  return groups;
}

function draftCard(draft) {
  const badge = draftBadge(draft.project);

  // event в inline-обработчике — аргумент функции, а не устаревший window.event
  // noinspection JSDeprecatedSymbols
  return `
    <div class="draft-item ${draft.id === currentDraft._id ? "active" : ""}"
         onclick="openDraft('${draft.id}')">
      <div class="head">
        <div class="t">${escapeHtml(draft.title)}</div>
        <span class="badge ${badge.kind}">${escapeHtml(badge.label)}</span>
      </div>
      <div class="m">изм. ${formatUpdatedAt(draft.updated)} · ${draft.cases} кейс. · ${draft.bugs} баг.</div>
      <div class="acts">
        <button onclick="event.stopPropagation();renameDraft('${draft.id}','${escapeHtml(draft.title)}')">переименовать</button>
        <button class="del" onclick="event.stopPropagation();deleteDraft('${draft.id}')">удалить</button>
      </div>
    </div>`;
}

/** Перерисовывает список черновиков в боковой панели. */
export async function refreshDraftList() {
  const { drafts } = await api.fetchDraftList();
  const list = byId("draftList");

  // на пустом списке ноль рядом с заголовком только шумит
  byId("draftCount").textContent = drafts.length || "";

  if (!drafts.length) {
    list.innerHTML = `<div class="sidebar-empty">Пока нет сохранённых черновиков</div>`;
    return;
  }

  list.innerHTML = groupByDay(drafts).map(({ day, items }) => `
    <div class="draft-day">${day} · <span class="n">${items.length}</span></div>
    <div class="draft-group">${items.map(draftCard).join("")}</div>`).join("");
}

/**
 * Удаляет черновик, из которого убрали всё содержимое.
 *
 * Вызывается при уходе на другой черновик: пустой файл в списке только мешает,
 * но удаление можно отменить — кнопка возвращает файл, не меняя навигацию.
 */
async function dropCurrentIfEmpty() {
  if (!currentDraft?._id || !isDraftEmpty()) return;

  const draftId = currentDraft._id;
  const title = currentDraft._title || "без названия";
  const snapshot = JSON.parse(JSON.stringify(currentDraft));

  await api.deleteDraft(draftId);
  if (localStorage.getItem(LAST_DRAFT_STORAGE_KEY) === draftId) {
    localStorage.removeItem(LAST_DRAFT_STORAGE_KEY);
  }

  showToast(`Пустой отчёт <b>${escapeHtml(title)}</b> удалён`, {
    onUndo: async () => {
      await api.saveDraft(snapshot);
      await refreshDraftList();
    },
  });
}

/** Открывает выбранный черновик. */
export async function openDraft(draftId) {
  if (draftId === currentDraft._id) {
    closeSidebar();
    return;
  }

  await dropCurrentIfEmpty();
  clearResumeCandidate();

  setCurrentDraft(await api.fetchDraft(draftId));
  cleanupEmptyListItems(currentDraft);
  rememberOpenDraft(draftId);

  syncHeader();
  render();
  closeSidebar();
  setAutosaveStatus("");
  await refreshDraftList();
}

/** Переходит на чистый лист, не трогая текущий черновик. */
export async function openBlankDraft() {
  clearResumeCandidate();

  setCurrentDraft(await api.fetchEmptyDraft());
  currentDraft._id = null;
  currentDraft._title = null;
  forgetOpenDraft();

  syncHeader();
  render();
  closeSidebar();
  setAutosaveStatus("");
  await refreshDraftList();
}

/** Создаёт новый черновик, убрав текущий, если он опустел. */
export async function startNewDraft() {
  await dropCurrentIfEmpty();
  await openBlankDraft();
}

export async function renameDraft(draftId, currentTitle) {
  const title = prompt("Новое название:", currentTitle);
  if (title === null) return;

  await api.renameDraft(draftId, title);
  if (currentDraft._id === draftId) {
    currentDraft._title = title;
    byId("draftName").textContent = title;
  }
  await refreshDraftList();
}

export async function deleteDraft(draftId) {
  if (!confirm("Удалить этот черновик?")) return;

  await api.deleteDraft(draftId);
  if (localStorage.getItem(LAST_DRAFT_STORAGE_KEY) === draftId) {
    localStorage.removeItem(LAST_DRAFT_STORAGE_KEY);
  }

  if (currentDraft._id === draftId) {
    await openBlankDraft();
  } else {
    await refreshDraftList();
  }
}

/** Переименование черновика по клику на название в шапке. */
export async function renameCurrentDraft(saveNow) {
  const title = prompt("Название черновика:", currentDraft._title || "");
  if (title === null) return;

  currentDraft._title = title;
  byId("draftName").textContent = title;
  await saveNow();
}
