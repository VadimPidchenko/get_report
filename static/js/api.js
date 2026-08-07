// Единая точка обращения к бэкенду.
// Все запросы проходят здесь, поэтому обработка ошибок описана один раз.

/** Ошибка запроса с текстом от сервера. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const details = await response.text();
    throw new ApiError(details || response.statusText, response.status);
  }

  return response.json();
}

function postJson(url, payload) {
  return request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ─── черновики ───

export const fetchEmptyDraft = () => request("/api/empty");

export const fetchDraftList = () => request("/api/drafts");

export const fetchDraft = (draftId) => request(`/api/draft/${draftId}`);

export const saveDraft = (draft) => postJson("/api/draft", draft);

export const renameDraft = (draftId, title) =>
  postJson(`/api/draft/${draftId}/rename`, { title });

export const deleteDraft = (draftId) =>
  request(`/api/draft/${draftId}`, { method: "DELETE" });

// ─── картинки ───

export function uploadImage(draftId, file) {
  const form = new FormData();
  form.append("file", file);
  return request(`/api/upload/${draftId}`, { method: "POST", body: form });
}

export const imageUrl = (draftId, filename) =>
  `/api/screenshot/${draftId}/${encodeURIComponent(filename)}`;

export const deleteImage = (draftId, filename) =>
  request(`/api/screenshot/${draftId}/${encodeURIComponent(filename)}`, { method: "DELETE" });

export const restoreImage = (draftId, filename, data) =>
  postJson(`/api/screenshot/${draftId}/${encodeURIComponent(filename)}/restore`, { data });

// ─── отчёты ───

export const buildReport = (outputFormat, draft) =>
  postJson(`/api/report/${outputFormat}`, draft);

export const reportUrl = (draftId, filename) => `/api/report/${draftId}/${filename}`;
