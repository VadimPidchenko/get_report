// Скачивание отчёта и проверка обязательных полей перед сборкой.
//
// Кнопки заблокированы, пока в черновике нет ни одного кейса — скачивать нечего.
// Незаполненные названия кнопки не блокируют: о них сообщаем при нажатии,
// подсвечивая проблемные карточки.

import * as api from "./api.js";
import { byId } from "./dom.js";
import { currentDraft, collectHeaderFields, saveNow } from "./state.js";
import { setStatusMessage, showToast } from "./notifications.js";

const VALIDATION_MESSAGE_TIMEOUT_MS = 4500;
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
  input.closest(".card")?.querySelector(`.req-hint[data-error-for="${input.id}"]`)?.remove();
}

function markFieldInvalid(itemType, itemIndex) {
  const input = byId(`title-${itemType}-${itemIndex}`);
  if (!input) return;

  input.classList.add("invalid");
  const head = input.closest(".card-head");
  if (head && !head.parentElement.querySelector(".req-hint")) {
    const hint = document.createElement("div");
    hint.className = "req-hint";
    hint.dataset.errorFor = input.id;
    hint.textContent = "Обязательное поле";
    head.insertAdjacentElement("afterend", hint);
  }
}

/** Сообщение о незаполненном поле: тот же статус в подвале, но красным. */
function setProblemMessage(text) {
  byId("statusMsg").classList.add("error");
  setStatusMessage(text, VALIDATION_MESSAGE_TIMEOUT_MS);
  showToast(text, { timeout: VALIDATION_MESSAGE_TIMEOUT_MS, kind: "error" });
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

/** Ищет кейсы и баг-репорты, у которых статус ещё не выбран. */
function findItemsWithoutStatus() {
  const problems = [];

  currentDraft.cases.forEach((testCase, index) => {
    if (!String(testCase.status || "").trim()) problems.push({ itemType: "case", index });
  });
  currentDraft.bugs.forEach((bug, index) => {
    if (!String(bug.status || "").trim()) problems.push({ itemType: "bug", index });
  });

  return problems;
}

/** Форма слова после «в N»: в 1/21 кейсе, но в 2/5/11 кейсах. */
function locationForm(count, one, many) {
  return count % 10 === 1 && count % 100 !== 11 ? one : many;
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

/** Подсвечивает пустые статусы и переводит пользователя к первому из них. */
function highlightMissingStatuses(problems) {
  const first = problems[0];
  const requiredTab = first.itemType === "case" ? "cases" : "bugs";

  const activeTab = document.querySelector(".tab.active")?.dataset.tab;
  if (activeTab !== requiredTab) {
    document.querySelector(`.tab[data-tab="${requiredTab}"]`)?.click();
  }

  problems.forEach(({ itemType, index }) => {
    byId(`status-${itemType}-${index}`)?.classList.add("invalid");
  });

  const dropdown = byId(`status-${first.itemType}-${first.index}`);
  if (dropdown) {
    dropdown.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => dropdown.querySelector(".status-trigger")?.focus(), SCROLL_FOCUS_DELAY_MS);
  }

  const caseCount = problems.filter(({ itemType }) => itemType === "case").length;
  const bugCount = problems.length - caseCount;
  const details = [
    caseCount ? `в ${caseCount} ${locationForm(caseCount, "тест-кейсе", "тест-кейсах")}` : "",
    bugCount ? `в ${bugCount} ${locationForm(bugCount, "баг-репорте", "баг-репортах")}` : "",
  ].filter(Boolean).join(" и ");
  const statusWord = problems.length === 1 ? "статус" : "статусы";
  setProblemMessage(`Выберите ${statusWord} ${details}`);
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

  const missingStatuses = findItemsWithoutStatus();
  if (missingStatuses.length) {
    highlightMissingStatuses(missingStatuses);
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
