// Скачивание отчёта и проверка обязательных полей перед сборкой.
//
// Кнопки заблокированы, пока в черновике нет ни одного кейса — скачивать нечего.
// Незаполненные названия кнопки не блокируют: о них сообщаем при нажатии,
// подсвечивая проблемные карточки.

import * as api from "./api.js";
import { byId } from "./dom.js";
import { currentDraft, collectHeaderFields, saveNow } from "./state.js";
import { setStatusMessage } from "./notifications.js";

const VALIDATION_MESSAGE_TIMEOUT_MS = 4000;
const SCROLL_FOCUS_DELAY_MS = 300;

const downloadButtons = () => [byId("dlDocx"), byId("dlPdf")];

/** Блокирует кнопки на время сборки отчёта. */
function setButtonsBusy(isBusy) {
  downloadButtons().forEach((button) => { button.disabled = isBusy; });
}

/** Обновляет доступность кнопок под текущее содержимое черновика. */
export function refreshDownloadButtons() {
  const canDownload = currentDraft.cases.length > 0;
  downloadButtons().forEach((button) => {
    button.disabled = !canDownload;
    button.title = canDownload ? "" : "Добавьте хотя бы один тест-кейс";
  });
}

/** Снимает подсветку с исправленного поля. */
export function clearFieldError(input) {
  input.classList.remove("invalid");
  input.closest(".card")?.querySelector(".req-hint")?.remove();
}

function markFieldInvalid(itemType, itemIndex) {
  const input = byId(`title-${itemType}-${itemIndex}`);
  if (!input) return;

  input.classList.add("invalid");
  const head = input.closest(".card-head");
  if (head && !head.parentElement.querySelector(".req-hint")) {
    const hint = document.createElement("div");
    hint.className = "req-hint";
    hint.textContent = "Обязательное поле";
    head.insertAdjacentElement("afterend", hint);
  }
}

/** Сообщение о незаполненном поле: тот же статус в подвале, но красным. */
function setProblemMessage(text) {
  byId("statusMsg").classList.add("error");
  setStatusMessage(text, VALIDATION_MESSAGE_TIMEOUT_MS);
}

/** Проект обязателен: без него в шапке отчёта пустое место. */
function validateProject() {
  const select = byId("project");
  if (select.value) return true;

  select.classList.add("invalid");
  select.focus();
  setProblemMessage("Выберите проект");
  return false;
}

/** Ищет кейсы и баги без названия. */
function findItemsWithoutTitle() {
  const problems = [];

  currentDraft.cases.forEach((testCase, index) => {
    if (!String(testCase.name || "").trim()) problems.push({ itemType: "case", index });
  });
  currentDraft.bugs.forEach((bug, index) => {
    if (!String(bug.title || "").trim()) problems.push({ itemType: "bug", index });
  });

  return problems;
}

/** Подсвечивает проблемные поля и переводит внимание на первое из них. */
function highlightMissingTitles(problems) {
  const first = problems[0];
  const requiredTab = first.itemType === "case" ? "cases" : "bugs";

  const activeTab = document.querySelector(".tab.active")?.dataset.tab;
  if (activeTab !== requiredTab) {
    document.querySelector(`.tab[data-tab="${requiredTab}"]`)?.click();
  }

  problems.forEach(({ itemType, index }) => markFieldInvalid(itemType, index));

  const input = byId(`title-${first.itemType}-${first.index}`);
  if (input) {
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => input.focus(), SCROLL_FOCUS_DELAY_MS);
  }

  const message = problems.length === 1
    ? "Заполните название"
    : `Заполните названия (${problems.length})`;
  setProblemMessage(message);
}

/** Отдаёт файл браузеру через скрытую ссылку. */
function triggerDownload(url) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Готовит и скачивает отчёт.
 * Сборка идёт на сервере; если черновик не менялся, файл придёт из кеша.
 */
async function downloadReport(outputFormat, button) {
  // проект проверяем первым: он в шапке и виден всегда,
  // а названия кейсов могут потребовать переключения вкладки
  if (!validateProject()) return;

  const problems = findItemsWithoutTitle();
  if (problems.length) {
    highlightMissingTitles(problems);
    return;
  }

  const originalLabel = button.textContent;
  setButtonsBusy(true);
  button.textContent = "Готовлю…";
  byId("statusMsg").classList.remove("error");
  setStatusMessage("");

  try {
    await saveNow();
    if (!currentDraft._id) {
      setStatusMessage("Нечего скачивать");
      return;
    }

    const { file } = await api.buildReport(outputFormat, collectHeaderFields());
    triggerDownload(api.reportUrl(currentDraft._id, file));
  } catch (error) {
    setStatusMessage(`Ошибка: ${String(error.message).slice(0, 160)}`);
  } finally {
    button.textContent = originalLabel;
    setButtonsBusy(false);
    refreshDownloadButtons();
  }
}

export function initDownloadButtons() {
  byId("dlDocx").onclick = (event) => downloadReport("docx", event.currentTarget);
  byId("dlPdf").onclick = (event) => downloadReport("pdf", event.currentTarget);
}
