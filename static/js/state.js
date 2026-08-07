// Текущий черновик и его автосохранение.
//
// Черновик создаётся на сервере не сразу: пока в нём нет ни кейсов, ни багов,
// сохранять нечего. Так случайное нажатие «Новый черновик» не плодит пустышки.

import * as api from "./api.js";
import { byId } from "./dom.js";

const AUTOSAVE_DELAY_MS = 800;
const AUTOSAVE_FADE_MS = 3000;

/** Ключ, по которому запоминаем последний открытый черновик между запусками. */
export const LAST_DRAFT_STORAGE_KEY = "report_app_last_draft";

/** Черновик, открытый в этой вкладке. Живёт до её закрытия. */
const OPEN_DRAFT_SESSION_KEY = "report_app_open_draft";

/** Запоминает открытый черновик — и между запусками, и в пределах вкладки. */
export function rememberOpenDraft(draftId) {
  localStorage.setItem(LAST_DRAFT_STORAGE_KEY, draftId);
  sessionStorage.setItem(OPEN_DRAFT_SESSION_KEY, draftId);
}

/** Открытого черновика больше нет: чистый лист. */
export function forgetOpenDraft() {
  localStorage.removeItem(LAST_DRAFT_STORAGE_KEY);
  sessionStorage.removeItem(OPEN_DRAFT_SESSION_KEY);
}

/** Что было открыто в этой вкладке до перезагрузки. */

export const getOpenDraftId = () => sessionStorage.getItem(OPEN_DRAFT_SESSION_KEY);

/** Текущий черновик. Меняется при переключении в боковой панели. */
export let currentDraft = null;

let autosaveTimer = null;
let autosaveFadeTimer = null;
let onSavedCallback = () => {};

/**
 * Статус автосохранения.
 *
 * Текст не удаляем, а гасим прозрачностью: место под индикатор в шапке
 * зарезервировано всегда, иначе соседние элементы дёргаются.
 */
export function setAutosaveStatus(text, { fade = false } = {}) {
  const element = byId("autosave");
  clearTimeout(autosaveFadeTimer);

  element.textContent = text;
  element.style.opacity = text ? "1" : "0";

  if (fade) {
    autosaveFadeTimer = setTimeout(() => { element.style.opacity = "0"; }, AUTOSAVE_FADE_MS);
  }
}

export function setCurrentDraft(draft) {
  currentDraft = draft;
  currentDraft.cases = currentDraft.cases || [];
  currentDraft.bugs = currentDraft.bugs || [];
}

/** Колбэк, который вызывается после успешного сохранения. */
export function onDraftSaved(callback) {
  onSavedCallback = callback;
}

/** Черновик считается пустым, пока в нём нет ни кейсов, ни багов. */
export const isDraftEmpty = (draft = currentDraft) =>
  !draft.cases.length && !draft.bugs.length;

/** Стоит ли вообще создавать файл черновика на сервере. */
export const isDraftWorthSaving = (draft = currentDraft) =>
  !isDraftEmpty(draft) || Boolean(draft._title);

/** Забирает значения из шапки в состояние. */
export function collectHeaderFields() {
  currentDraft.project = byId("project").value;
  currentDraft.date = byId("date").value;
  currentDraft.jira_base = byId("jira").value;
  return currentDraft;
}

/** Откладывает сохранение — частые правки не бомбардируют сервер. */
export function scheduleSave() {
  setAutosaveStatus("…");
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveNow, AUTOSAVE_DELAY_MS);
}

/** Сохраняет черновик немедленно. */
export async function saveNow() {
  collectHeaderFields();

  if (!currentDraft._id && !isDraftWorthSaving()) {
    setAutosaveStatus("");
    return;
  }

  const { id, title } = await api.saveDraft(currentDraft);
  currentDraft._id = id;
  currentDraft._title = title;

  rememberOpenDraft(id);
  byId("draftName").textContent = title;
  setAutosaveStatus("сохранено ✓", { fade: true });
  onSavedCallback();
}

/** Гарантирует, что у черновика есть id — нужно перед загрузкой картинок. */
export async function ensureDraftId() {
  if (!currentDraft._id) await saveNow();
  return currentDraft._id;
}

// ─── операции над кейсами и багами ───

export const createTestCase = () => ({
  name: "",
  tasks: [""],
  precondition: [""],
  steps: [""],
  expected: [""],
  expected_images: [],
  result: [""],
  result_images: [],
  status: "Passed",
});

export const createBug = () => ({
  title: "",
  tasks: [""],
  desc: "",
  status: "To Do",
  images: [],
});

// Поля-списки, которые нужно подчищать от пустых пунктов.
const LIST_FIELDS = {
  case: ["tasks", "precondition", "steps", "expected", "result"],
  bug: ["tasks"],
};

/**
 * Убирает пустые пункты из полей-списков всего черновика.
 * Единственный пункт оставляем, даже пустой, — поле не должно исчезать.
 * Вызывается при открытии черновика, чтобы забытые пустые строки не копились.
 */
export function cleanupEmptyListItems(draft) {
  const clean = (items, fields) => {
    for (const item of items) {
      for (const field of fields) {
        const filled = (item[field] || []).filter((value) => value.trim() !== "");
        item[field] = filled.length ? filled : [""];
      }
    }
  };

  clean(draft.cases || [], LIST_FIELDS.case);
  clean(draft.bugs || [], LIST_FIELDS.bug);
}

/** Список кейсов или багов по типу элемента. */
export const itemsOf = (itemType) =>
  itemType === "case" ? currentDraft.cases : currentDraft.bugs;
