// Автосохранение текущего черновика и связанные с ним UI-эффекты.
//
// Черновик создаётся на сервере не сразу: пока в нём нет ни кейсов, ни багов,
// сохранять нечего. Так случайное нажатие «Новый черновик» не плодит пустышки.

import * as api from "./api.js";
import { byId } from "./dom.js";
import { currentDraft, isDraftWorthSaving } from "./state.js";
import { rememberOpenDraft } from "./draft-session.js";

const AUTOSAVE_DELAY_MS = 800;
const AUTOSAVE_FADE_MS = 3000;

let scheduledSave = null;
let autosaveFadeTimer = null;
let saveQueue = Promise.resolve();
let nextSaveGeneration = 0;
let onSavedCallback = () => {};

/** Последнее запрошенное сохранение для каждого объекта черновика. */
const latestGenerationByDraft = new WeakMap();

/**
 * Статус автосохранения.
 *
 * Текст не удаляем, а гасим прозрачностью: место под индикатор в шапке
 * зарезервировано всегда, иначе соседние элементы дёргаются.
 */
function setSaveStatus(text, { fade = false } = {}) {
  const element = byId("autosave");
  clearTimeout(autosaveFadeTimer);

  element.textContent = text;
  element.style.opacity = text ? "1" : "0";

  if (fade) {
    autosaveFadeTimer = setTimeout(() => { element.style.opacity = "0"; }, AUTOSAVE_FADE_MS);
  }
}

/** Убирает статус при переходе на другой черновик или на чистый лист. */
export function clearSaveStatus() {
  setSaveStatus("");
}

/** Колбэк, который вызывается после успешного сохранения текущего черновика. */
export function onDraftSaved(callback) {
  onSavedCallback = callback;
}

function markSaveRequested(draft) {
  const generation = ++nextSaveGeneration;
  latestGenerationByDraft.set(draft, generation);
  return generation;
}

const isLatestSave = (draft, generation) =>
  latestGenerationByDraft.get(draft) === generation;

/** Callback не должен превращать успешное сохранение в ошибку autosave. */
function notifyDraftSaved() {
  try {
    Promise.resolve(onSavedCallback()).catch((error) => {
      console.error("Не удалось выполнить действие после сохранения черновика", error);
    });
  } catch (error) {
    console.error("Не удалось выполнить действие после сохранения черновика", error);
  }
}

/** Выполняет один запрос и применяет ответ только к связанному с ним draft. */
async function persistDraft(draft, generation) {
  if (!draft._id && !isDraftWorthSaving(draft)) {
    if (draft === currentDraft && isLatestSave(draft, generation)) clearSaveStatus();
    return null;
  }

  try {
    const { id, title } = await api.saveDraft(draft);
    draft._id = id;

    // Более свежая правка могла изменить название, пока запрос был в пути.
    if (!isLatestSave(draft, generation)) return id;
    draft._title = title;

    if (draft === currentDraft) {
      rememberOpenDraft(id);
      byId("draftName").textContent = title;
      setSaveStatus("сохранено ✓", { fade: true });
    }

    // Список в сайдбаре должен обновиться и для draft, сохранённого уже после переключения.
    notifyDraftSaved();
    return id;
  } catch (error) {
    if (draft === currentDraft && isLatestSave(draft, generation)) {
      setSaveStatus("ошибка сохранения");
    }
    throw error;
  }
}

/**
 * Все запросы идут по очереди. Поэтому старое сохранение не может завершиться
 * после нового и перезаписать его результат на сервере или в интерфейсе.
 */
function enqueueSave(draft, generation) {
  const task = saveQueue.then(() => persistDraft(draft, generation));
  saveQueue = task.catch(() => {});
  return task;
}

function takeScheduledSave() {
  if (!scheduledSave) return null;

  clearTimeout(scheduledSave.timer);
  const pending = scheduledSave;
  scheduledSave = null;
  return pending;
}

/** Запускает отложенное сохранение без необработанного Promise. */
function runScheduledSave(pending) {
  void enqueueSave(pending.draft, pending.generation).catch(() => {});
}

/** Откладывает сохранение — частые правки не бомбардируют сервер. */
export function scheduleSave() {
  const draft = currentDraft;
  const previous = takeScheduledSave();

  // Если пользователь уже переключился, не теряем отложенные правки прошлого draft.
  if (previous && previous.draft !== draft) runScheduledSave(previous);

  const generation = markSaveRequested(draft);
  setSaveStatus("…");

  const timer = setTimeout(() => {
    if (scheduledSave?.timer !== timer) return;
    const pending = scheduledSave;
    scheduledSave = null;
    runScheduledSave(pending);
  }, AUTOSAVE_DELAY_MS);

  scheduledSave = { draft, generation, timer };
}

function saveDraftNow(draft) {
  const pending = takeScheduledSave();

  if (pending) {
    const pendingTask = enqueueSave(pending.draft, pending.generation);
    if (pending.draft === draft) return pendingTask;
    void pendingTask.catch(() => {});
  }

  return enqueueSave(draft, markSaveRequested(draft));
}

/** Сохраняет текущий черновик немедленно. */
export function saveNow() {
  return saveDraftNow(currentDraft);
}

/** Гарантирует, что у черновика есть id — нужно перед загрузкой картинок. */
export async function ensureDraftId() {
  const draft = currentDraft;

  try {
    if (!draft._id) await saveDraftNow(draft);
  } catch {
    return null;
  }

  return draft._id || null;
}
