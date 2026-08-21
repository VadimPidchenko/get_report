// Скачивание отчёта и проверка обязательных полей перед сборкой.
//
// Кнопки заблокированы, пока в черновике нет ни одного кейса — скачивать нечего.
// Незаполненные названия кнопки не блокируют: о них сообщаем при нажатии,
// подсвечивая проблемные карточки.

import * as api from "./api.js";
import { byId } from "./dom.js";
import { currentDraft } from "./state.js";
import { saveNow } from "./draft-persistence.js";
import { setStatusMessage, showToast } from "./notifications.js";

const VALIDATION_MESSAGE_TIMEOUT_MS = 4500;
const SCROLL_FOCUS_DELAY_MS = 360;
const TITLE_ERROR_VIEWPORT_RATIO = 0.25;
const STATUS_ERROR_VIEWPORT_RATIO = 0.68;

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
  if (input.id === "projectDropdown") byId("project")?.classList.remove("invalid");
  input.closest?.(".card")?.querySelector(`.req-hint[data-error-for="${input.id}"]`)?.remove();
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

/** Общее сообщение о валидации показываем только toast-уведомлением.
 * Локальная причина остаётся рядом с конкретным полем.
 */
function setProblemMessage(text) {
  byId("statusMsg")?.classList.remove("error");
  setStatusMessage("");
  showToast(text, { timeout: VALIDATION_MESSAGE_TIMEOUT_MS, kind: "error", key: "validation" });
}

/** Проект обязателен: без него в шапке отчёта пустое место. */
function validateProject() {
  const select = byId("project");
  if (select.value) return true;

  const dropdown = byId("projectDropdown");
  dropdown.classList.add("invalid");
  byId("projectTrigger")?.focus();
  setProblemMessage("Выберите проект");
  return false;
}

/** Собирает обязательные поля, которые не заполнены, отдельно по вкладкам. */
function collectRequiredFieldProblems() {
  const problems = { cases: [], bugs: [] };

  currentDraft.cases.forEach((testCase, index) => {
    if (!String(testCase.name || "").trim()) {
      problems.cases.push({ kind: "title", itemType: "case", index });
    }
    if (!String(testCase.status || "").trim()) {
      problems.cases.push({ kind: "status", itemType: "case", index });
    }
  });

  currentDraft.bugs.forEach((bug, index) => {
    if (!String(bug.title || "").trim()) {
      problems.bugs.push({ kind: "title", itemType: "bug", index });
    }
    if (!String(bug.status || "").trim()) {
      problems.bugs.push({ kind: "status", itemType: "bug", index });
    }
  });

  return problems;
}

function targetForProblem(problem) {
  if (problem.kind === "title") {
    const input = byId(`title-${problem.itemType}-${problem.index}`);
    return { container: input, focusTarget: input, viewportRatio: TITLE_ERROR_VIEWPORT_RATIO };
  }

  const dropdown = byId(`status-${problem.itemType}-${problem.index}`);
  return {
    container: dropdown,
    focusTarget: dropdown?.querySelector(".status-trigger"),
    viewportRatio: STATUS_ERROR_VIEWPORT_RATIO,
  };
}

/**
 * Ставит проблемное поле в предсказуемую точку viewport, а не строго по центру.
 * Название кейса показываем в верхней трети — там его удобнее сразу исправлять.
 * Статус оставляем ниже: над ним остаётся контекст карточки, к которой он относится.
 */
function scrollProblemIntoView(target) {
  if (!target?.container) return;

  const rect = target.container.getBoundingClientRect();
  const headerBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
  const footerTop = document.querySelector(".footbar")?.getBoundingClientRect().top ?? window.innerHeight;
  const visibleTop = Math.max(0, headerBottom);
  const visibleBottom = Math.min(window.innerHeight, footerTop);
  const visibleHeight = Math.max(1, visibleBottom - visibleTop);
  const ratio = target.viewportRatio ?? 0.5;
  const desiredCenterY = visibleTop + visibleHeight * ratio;
  const currentCenterY = rect.top + rect.height / 2;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const nextTop = Math.max(0, Math.min(maxScroll, window.scrollY + currentCenterY - desiredCenterY));

  window.scrollTo({ top: nextTop, behavior: "smooth" });
  setTimeout(() => target.focusTarget?.focus({ preventScroll: true }), SCROLL_FOCUS_DELAY_MS);
}

function markProblemInvalid(problem) {
  if (problem.kind === "title") {
    markFieldInvalid(problem.itemType, problem.index);
    return;
  }
  byId(`status-${problem.itemType}-${problem.index}`)?.classList.add("invalid");
}

/**
 * Показывает ошибки только на одной вкладке за попытку генерации.
 * Если на текущей вкладке есть ошибки — остаёмся на ней и показываем их все
 * (и названия, и статусы). На другую вкладку переходим только после того,
 * как текущая исправлена. Так validation не "мотает" пользователя туда-сюда.
 */
function highlightRequiredFields(problemsByTab) {
  const activeTab = document.querySelector(".tab.active")?.dataset.tab || "cases";
  const currentProblems = problemsByTab[activeTab] || [];
  const targetTab = currentProblems.length
    ? activeTab
    : (problemsByTab.cases.length ? "cases" : (problemsByTab.bugs.length ? "bugs" : null));

  if (!targetTab) return false;

  if (activeTab !== targetTab) {
    document.querySelector(`.tab[data-tab="${targetTab}"]`)?.click();
  }

  const problems = problemsByTab[targetTab];
  problems.forEach(markProblemInvalid);

  const firstTarget = targetForProblem(problems[0]);
  scrollProblemIntoView(firstTarget);

  setProblemMessage("Заполните обязательные поля");
  return true;
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

  const requiredFieldProblems = collectRequiredFieldProblems();
  if (highlightRequiredFields(requiredFieldProblems)) return;

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

    const { file } = await api.buildReport(outputFormat, currentDraft);
    triggerDownload(api.reportUrl(currentDraft._id, file));
  } catch (error) {
    const message = `Ошибка: ${String(error.message).slice(0, 160)}`;
    setStatusMessage(message);
    showToast(message, { kind: "error", timeout: 6500 });
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
