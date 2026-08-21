// Запоминание открытого черновика между перезагрузками и запусками приложения.

/** Ключ последнего открытого черновика между запусками. */
const LAST_DRAFT_STORAGE_KEY = "report_app_last_draft";

/** Черновик, открытый в этой вкладке. Живёт до её закрытия. */
const OPEN_DRAFT_SESSION_KEY = "report_app_open_draft";

/** Последний открытый черновик между запусками приложения. */
export const getLastDraftId = () => localStorage.getItem(LAST_DRAFT_STORAGE_KEY);

/** Забывает последний открытый черновик, не меняя состояние текущей вкладки. */
export function forgetLastDraft() {
  localStorage.removeItem(LAST_DRAFT_STORAGE_KEY);
}

/** Запоминает открытый черновик — и между запусками, и в пределах вкладки. */
export function rememberOpenDraft(draftId) {
  localStorage.setItem(LAST_DRAFT_STORAGE_KEY, draftId);
  sessionStorage.setItem(OPEN_DRAFT_SESSION_KEY, draftId);
}

/** Открытого черновика больше нет: чистый лист. */
export function forgetOpenDraft() {
  forgetLastDraft();
  sessionStorage.removeItem(OPEN_DRAFT_SESSION_KEY);
}

/** Что было открыто в этой вкладке до перезагрузки. */
export const getOpenDraftId = () => sessionStorage.getItem(OPEN_DRAFT_SESSION_KEY);
