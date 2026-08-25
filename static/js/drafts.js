// Боковая панель со списком черновиков и переключение между ними.

import * as api from "./api.js";
import { byId, escapeHtml } from "./dom.js";
import { draftBadge, formatDay } from "./draft-meta.js";
import {
  currentDraft,
  setCurrentDraft,
  isDraftEmpty,
  cleanupEmptyListItems,
} from "./state.js";
import {
  getLastDraftId,
  rememberOpenDraft,
  forgetLastDraft,
  forgetOpenDraft,
} from "./draft-session.js";
import { clearSaveStatus, saveNow } from "./draft-persistence.js";
import {
  render,
  syncHeader,
  clearResumeCandidate,
  getResumeCandidate,
} from "./render.js";
import { showToast } from "./notifications.js";
import { askText, confirmAction } from "./dialogs.js";
import { closeItemMenus } from "./editor.js";

function openSidebar() {
  byId("sidebar").classList.add("open");
  byId("backdrop").classList.add("show");
}

function closeSidebar() {
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

  return `
    <div class="draft-item project-${badge.kind} ${draft.id === currentDraft._id ? "active" : ""}"
         role="button" tabindex="0" data-draft-id="${escapeHtml(draft.id)}">
      <div class="head">
        <div class="t">${escapeHtml(draft.title)}</div>
        <div class="draft-actions">
          <button class="draft-menu-trigger" type="button" aria-label="Действия с отчётом" aria-expanded="false"
                  data-action="toggle-draft-menu">
            <span class="dots-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <circle cx="10" cy="4.25" r="1.6"></circle>
                <circle cx="10" cy="10" r="1.6"></circle>
                <circle cx="10" cy="15.75" r="1.6"></circle>
              </svg>
            </span>
          </button>
          <div class="draft-menu">
            <button type="button" data-action="rename-draft">
              <span class="menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M13.5 6.5 17.5 10.5M4 20l3.6-.8L18.7 8.1a1.8 1.8 0 0 0 0-2.6l-.2-.2a1.8 1.8 0 0 0-2.6 0L4.8 16.4 4 20Z"/></svg>
              </span>
              <span>Переименовать</span>
            </button>
            <button type="button" class="danger" data-action="delete-draft">
              <span class="menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M4.5 7h15M9 7V4.8h6V7m-8.7 0 .8 12h9.8l.8-12M10 10.5v5M14 10.5v5"/></svg>
              </span>
              <span>Удалить</span>
            </button>
          </div>
        </div>
      </div>
      <div class="draft-stats" aria-label="Количество кейсов и багов">
        <div class="draft-stat" title="Тест-кейсы">
          <span class="draft-stat-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <rect x="4" y="3.25" width="12" height="13.5" rx="2"/>
              <path d="M7 7h6M7 10h6M7 13h4"/>
            </svg>
          </span>
          <span class="draft-stat-main">
            <span class="draft-stat-value">${draft.cases}</span>
            <span class="draft-stat-label">кейс.</span>
          </span>
        </div>
        <span class="draft-stat-divider" aria-hidden="true"></span>
        <div class="draft-stat" title="Баги">
          <span class="draft-stat-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <path d="M7 6.25h6M6 8.25h8v4.25A4 4 0 0 1 10 16.5a4 4 0 0 1-4-4V8.25Z"/>
              <path d="M8 5a2 2 0 0 1 4 0M3.5 10H6M14 10h2.5M4.25 14l2-1M15.75 14l-2-1M4.25 6.5l2 1M15.75 6.5l-2 1M10 8.25v8.25"/>
            </svg>
          </span>
          <span class="draft-stat-main">
            <span class="draft-stat-value">${draft.bugs}</span>
            <span class="draft-stat-label">баг.</span>
          </span>
        </div>
      </div>
      <div class="draft-foot">
        <div class="draft-project ${badge.kind}">${escapeHtml(badge.label)}</div>
        <div class="draft-updated" title="Последнее изменение">
          <span class="draft-updated-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <rect x="3.25" y="4.5" width="13.5" height="12.25" rx="2"/>
              <path d="M6.25 2.75v3.5M13.75 2.75v3.5M3.5 8h13"/>
            </svg>
          </span>
          <span>${formatUpdatedAt(draft.updated)}</span>
        </div>
      </div>
    </div>`;
}

function toggleDraftMenu(trigger) {
  const card = trigger.closest(".draft-item");
  const menu = card?.querySelector(".draft-menu");
  if (!menu) return;

  const open = !menu.classList.contains("open");
  if (open) document.dispatchEvent(new Event("app:close-competing-menus"));
  closeItemMenus();

  document.querySelectorAll(".draft-menu.open").forEach((opened) => {
    if (opened !== menu) {
      opened.classList.remove("open");
      const openedCard = opened.closest(".draft-item");
      openedCard?.classList.remove("menu-open");
      openedCard?.querySelector(".draft-menu-trigger")?.setAttribute("aria-expanded", "false");
    }
  });

  menu.classList.toggle("open", open);
  card.classList.toggle("menu-open", open);
  trigger.setAttribute("aria-expanded", String(open));
}

export function closeDraftMenus() {
  document.querySelectorAll(".draft-menu.open").forEach((menu) => {
    menu.classList.remove("open");
    menu.closest(".draft-item")?.classList.remove("menu-open");
  });
  document.querySelectorAll(".draft-menu-trigger[aria-expanded=\"true\"]").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
}

/** Перерисовывает список черновиков в боковой панели. */
export async function refreshDraftList() {
  const { drafts } = await api.fetchDraftList();
  const list = byId("draftList");
  const count = byId("draftCount");

  // На пустом списке badge целиком скрыт: пустой span всё равно рисовал кружок.
  count.textContent = String(drafts.length);
  count.hidden = !drafts.length;
  list.classList.toggle("empty", !drafts.length);

  if (!drafts.length) {
    list.innerHTML = `
      <div class="sidebar-empty">
        <svg class="empty-state-icon" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M15.5 9.5h15l6 6v21a2.5 2.5 0 0 1-2.5 2.5H15.5A2.5 2.5 0 0 1 13 36.5V12a2.5 2.5 0 0 1 2.5-2.5Z"/>
          <path d="M30.5 9.5v6h6M19 23h12M19 28h12M19 33h8"/>
          <path class="empty-state-icon-muted" d="M10 14.5H8.5A2.5 2.5 0 0 0 6 17v21.5A2.5 2.5 0 0 0 8.5 41H29"/>
        </svg>
        <div class="empty-title">Пока нет сохранённых отчётов</div>
        <div class="empty-copy">Создайте первый отчёт, чтобы начать работу.</div>
      </div>`;
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
  if (getLastDraftId() === draftId) {
    forgetLastDraft();
  }

  showToast(`Пустой отчёт <b>${escapeHtml(title)}</b> удалён`, {
    onUndo: async () => {
      await api.saveDraft(snapshot);
      await refreshDraftList();
    },
  });
}

/** Открывает выбранный черновик. */
async function openDraft(draftId) {
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
  clearSaveStatus();
  await refreshDraftList();
}

/** Переходит на чистый лист, не трогая текущий черновик. */
async function openBlankDraft() {
  clearResumeCandidate();

  setCurrentDraft(await api.fetchEmptyDraft());
  currentDraft._id = null;
  currentDraft._title = null;
  forgetOpenDraft();

  syncHeader();
  render();
  closeSidebar();
  clearSaveStatus();
  await refreshDraftList();
}

/** Создаёт новый черновик, убрав текущий, если он опустел. */
async function startNewDraft() {
  await dropCurrentIfEmpty();
  await openBlankDraft();
}

/** Обновляет название текущего черновика через общую очередь сохранения. */
async function saveCurrentDraftTitle(title) {
  currentDraft._title = title;
  const draftName = byId("draftName");
  draftName.textContent = title;
  draftName.classList.remove("invalid");
  draftName.removeAttribute("aria-invalid");

  try {
    await saveNow();
  } catch {
    // Ошибка уже показана контроллером сохранения.
  }
}

async function renameDraft(draftId, currentTitle) {
  const title = await askText({
    title: "Переименовать отчёт",
    inputLabel: "Новое название",
    value: currentTitle,
    confirmLabel: "Сохранить",
    required: true,
  });
  if (title === null) return;

  if (currentDraft._id === draftId) {
    await saveCurrentDraftTitle(title);
    return;
  }

  await api.renameDraft(draftId, title);
  await refreshDraftList();
}

async function deleteDraft(draftId) {
  const confirmed = await confirmAction({
    title: "Удалить отчёт?",
    description: "Действие нельзя отменить.",
    confirmLabel: "Удалить",
    danger: true,
  });
  if (!confirmed) return;

  await api.deleteDraft(draftId);
  if (getLastDraftId() === draftId) {
    forgetLastDraft();
  }

  if (currentDraft._id === draftId) {
    await openBlankDraft();
  } else {
    await refreshDraftList();
  }
}

/** Переименование черновика по клику на название в шапке. */
async function renameCurrentDraft() {
  const title = await askText({
    title: currentDraft._title ? "Переименовать отчёт" : "Создать отчёт",
    inputLabel: currentDraft._title ? "Новое название" : "Название",
    value: currentDraft._title || "",
    confirmLabel: "Сохранить",
    required: true,
  });
  if (title === null) return;

  await saveCurrentDraftTitle(title);
}

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

function handleDraftListClick(event) {
  const actionTarget = event.target.closest?.("[data-action]");
  const card = event.target.closest?.(".draft-item[data-draft-id]");
  if (!card) return;

  if (actionTarget?.dataset.action === "toggle-draft-menu") {
    event.stopPropagation();
    toggleDraftMenu(actionTarget);
    return;
  }

  if (actionTarget?.dataset.action === "rename-draft") {
    event.stopPropagation();
    const title = card.querySelector(".t")?.textContent || "";
    void renameDraft(card.dataset.draftId, title);
    return;
  }

  if (actionTarget?.dataset.action === "delete-draft") {
    event.stopPropagation();
    void deleteDraft(card.dataset.draftId);
    return;
  }

  if (event.target.closest?.(".draft-menu")) {
    event.stopPropagation();
    return;
  }

  void openDraft(card.dataset.draftId);
}

function handleDraftListKeydown(event) {
  const card = event.target.closest?.(".draft-item[data-draft-id]");
  if (!card || event.target !== card || !["Enter", " "].includes(event.key)) return;

  event.preventDefault();
  void openDraft(card.dataset.draftId);
}

function handleResumeClick(event) {
  const actionTarget = event.target.closest?.("[data-action]");
  if (actionTarget?.dataset.action === "resume-last-draft") {
    void resumeLastDraft();
  } else if (actionTarget?.dataset.action === "dismiss-resume-bar") {
    dismissResumeBar();
  }
}

/** Подключает статические и делегированные события боковой панели/черновиков. */
export function initDraftEvents() {
  byId("burger").addEventListener("click", () => {
    const isOpen = byId("sidebar").classList.contains("open");
    if (isOpen) closeSidebar(); else openSidebar();
  });
  byId("backdrop").addEventListener("click", closeSidebar);
  byId("newDraftBtn").addEventListener("click", startNewDraft);
  byId("draftName").addEventListener("click", renameCurrentDraft);

  const draftList = byId("draftList");
  draftList.addEventListener("click", handleDraftListClick);
  draftList.addEventListener("keydown", handleDraftListKeydown);
  draftList.addEventListener("scroll", () => {
    document.dispatchEvent(new Event("app:close-competing-menus"));
    closeItemMenus();
  }, { passive: true });
  byId("casesPane").addEventListener("click", handleResumeClick);
}
