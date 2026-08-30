// Скачивание отчёта и проверка обязательных полей перед сборкой.
//
// Кнопки заблокированы, пока в черновике нет ни одного кейса — скачивать нечего.
// Незаполненные обязательные поля кнопки не блокируют: о них сообщаем при
// нажатии, подсвечивая проблемные места и не запуская сборку.

import * as api from "./api.js";
import { byId } from "./dom.js";
import { currentDraft } from "./state.js";
import { saveNow, scheduleSave } from "./draft-persistence.js";
import { setStatusMessage, showToast } from "./notifications.js";
import { confirmAction } from "./dialogs.js";
import { getSelectedReportFormat } from "./report-panel.js?v=report-statistics-2";

const VALIDATION_MESSAGE_TIMEOUT_MS = 4500;
const SCROLL_FOCUS_DELAY_MS = 360;
const TITLE_ERROR_VIEWPORT_RATIO = 0.25;
const EXPECTED_ERROR_VIEWPORT_RATIO = 0.45;
const STATUS_ERROR_VIEWPORT_RATIO = 0.68;
const RESULT_WARNING_VIEWPORT_RATIO = 0.45;
const RESULT_WARNING_HIGHLIGHT_MS = 1800;
const SKIP_FAILED_RESULTS_WARNING = "skip_failed_results_warning";
const REPORT_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const REPORT_READY_STATE_MS = 650;

const downloadButtons = () => [byId("generateReport")];

/** Блокирует кнопки на время сборки отчёта. */
function setButtonsBusy(isBusy) {
  downloadButtons().forEach((button) => { button.disabled = isBusy; });
  byId("reportPanelFields").disabled = isBusy;
  byId("reportCompositionControls").disabled = isBusy;
  byId("reportFormatFields").disabled = isBusy;
  byId("reportPanelClose").disabled = isBusy;
  byId("reportPanelTrigger").disabled = isBusy;
  byId("reportPanel").setAttribute("aria-busy", String(isBusy));
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
  input.removeAttribute("aria-invalid");
  if (input.id === "projectDropdown") byId("project")?.classList.remove("invalid");
  input.closest?.(".card")?.querySelector(`.req-hint[data-error-for="${input.id}"]`)?.remove();
}

function hasFilledListValue(values) {
  const items = Array.isArray(values) ? values : [values];
  return items.some((value) => String(value || "").trim());
}

/** Проверяет формат и календарную корректность даты отчёта. */
export function isValidReportDate(value) {
  const match = REPORT_DATE_PATTERN.exec(String(value || "").trim());
  if (!match) return false;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function clearExpectedError(field) {
  field.classList.remove("invalid");
  field.removeAttribute("aria-invalid");
  const card = field.closest(".card");
  const key = `expected-case-${field.dataset.itemIndex}`;
  card?.querySelector(`.req-hint[data-error-for="${key}"]`)?.remove();
}

/** Снимает подсветку обязательного поля сразу после корректного заполнения. */
export function initValidationEvents() {
  document.addEventListener("input", (event) => {
    if (event.target.matches?.(".card-head .title")) clearFieldError(event.target);

    if (event.target.id === "date" && isValidReportDate(event.target.value)) {
      clearFieldError(event.target);
    }

    const expectedField = event.target.closest?.(
      '.list-field[data-item-type="case"][data-field-name="expected"]',
    );
    if (!expectedField) return;

    const testCase = currentDraft.cases[Number(expectedField.dataset.itemIndex)];
    if (hasFilledListValue(testCase?.expected)) clearExpectedError(expectedField);
  });
}

function markFieldInvalid(itemType, itemIndex) {
  const input = byId(`title-${itemType}-${itemIndex}`);
  if (!input) return;

  input.classList.add("invalid");
  input.setAttribute("aria-invalid", "true");
  const head = input.closest(".card-head");
  if (head && !head.parentElement.querySelector(`.req-hint[data-error-for="${input.id}"]`)) {
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
  dropdown.setAttribute("aria-invalid", "true");
  byId("projectTrigger")?.focus();
  setProblemMessage("Выберите проект");
  return false;
}

/** Название редактируется существующим диалогом из кликабельной шапки. */
function validateReportTitle() {
  if (String(currentDraft._title || "").trim()) return true;

  const reportTitle = byId("reportTitle");
  const draftName = byId("draftName");
  reportTitle.classList.add("invalid");
  reportTitle.setAttribute("aria-invalid", "true");
  draftName.classList.add("invalid");
  draftName.setAttribute("aria-invalid", "true");
  setProblemMessage("Укажите название отчёта");
  document.dispatchEvent(new CustomEvent("app:open-report-panel", {
    detail: { focus: "title" },
  }));
  return false;
}

function validateReportDate() {
  const input = byId("date");
  if (isValidReportDate(input.value)) return true;

  input.classList.add("invalid");
  input.setAttribute("aria-invalid", "true");
  input.focus();
  const message = String(input.value || "").trim()
    ? "Укажите корректную дату в формате ДД.ММ.ГГГГ"
    : "Укажите дату отчёта";
  setProblemMessage(message);
  return false;
}

/** Собирает обязательные поля, которые не заполнены, отдельно по вкладкам. */
export function collectRequiredFieldProblems(draft = currentDraft) {
  const problems = { cases: [], bugs: [] };

  draft.cases.forEach((testCase, index) => {
    if (!String(testCase.name || "").trim()) {
      problems.cases.push({ kind: "title", itemType: "case", index });
    }
    if (!hasFilledListValue(testCase.expected)) {
      problems.cases.push({ kind: "expected", itemType: "case", index });
    }
    if (!String(testCase.status || "").trim()) {
      problems.cases.push({ kind: "status", itemType: "case", index });
    }
  });

  draft.bugs.forEach((bug, index) => {
    if (!String(bug.title || "").trim()) {
      problems.bugs.push({ kind: "title", itemType: "bug", index });
    }
    if (!String(bug.status || "").trim()) {
      problems.bugs.push({ kind: "status", itemType: "bug", index });
    }
  });

  return problems;
}

/** Failed-кейсы, в которых фактический результат никак не зафиксирован. */
export function collectFailedCasesWithoutResults(draft = currentDraft) {
  return draft.cases.reduce((problems, testCase, index) => {
    const hasTextResult = hasFilledListValue(testCase.result);
    const hasResultImage = Array.isArray(testCase.result_images) && testCase.result_images.length > 0;

    if (testCase.status === "Failed" && !hasTextResult && !hasResultImage) {
      problems.push({ index, name: String(testCase.name || "").trim() });
    }
    return problems;
  }, []);
}

function expectedFieldFor(itemIndex) {
  return document.querySelector(
    `.list-field[data-item-type="case"][data-item-index="${itemIndex}"][data-field-name="expected"]`,
  );
}

function resultFieldFor(itemIndex) {
  return document.querySelector(
    `.list-field[data-item-type="case"][data-item-index="${itemIndex}"][data-field-name="result"]`,
  );
}

function targetForProblem(problem) {
  if (problem.kind === "title") {
    const input = byId(`title-${problem.itemType}-${problem.index}`);
    return { container: input, focusTarget: input, viewportRatio: TITLE_ERROR_VIEWPORT_RATIO };
  }

  if (problem.kind === "expected") {
    const field = expectedFieldFor(problem.index);
    return {
      container: field,
      focusTarget: field?.querySelector("textarea"),
      viewportRatio: EXPECTED_ERROR_VIEWPORT_RATIO,
    };
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
  const visibleTop = Math.max(0, headerBottom);
  const visibleBottom = window.innerHeight;
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

  if (problem.kind === "expected") {
    const field = expectedFieldFor(problem.index);
    if (!field) return;

    field.classList.add("invalid");
    field.setAttribute("aria-invalid", "true");
    const key = `expected-case-${problem.index}`;
    if (!field.parentElement.querySelector(`.req-hint[data-error-for="${key}"]`)) {
      const hint = document.createElement("div");
      hint.className = "req-hint list-req-hint";
      hint.dataset.errorFor = key;
      hint.textContent = "Обязательное поле";
      field.insertAdjacentElement("afterend", hint);
    }
    return;
  }

  const dropdown = byId(`status-${problem.itemType}-${problem.index}`);
  dropdown?.classList.add("invalid");
  dropdown?.setAttribute("aria-invalid", "true");
}

/**
 * Показывает ошибки только на одной вкладке за попытку генерации.
 * Если на текущей вкладке есть ошибки — остаёмся на ней и показываем их все
 * (названия, ожидаемые результаты и статусы). На другую вкладку переходим только после того,
 * как текущая исправлена. Так validation не "мотает" пользователя туда-сюда.
 */
function highlightRequiredFields(problemsByTab) {
  const activeTab = document.querySelector(".tab.active")?.dataset.tab || "cases";
  const currentProblems = problemsByTab[activeTab] || [];
  const targetTab = currentProblems.length
    ? activeTab
    : (problemsByTab.cases.length ? "cases" : (problemsByTab.bugs.length ? "bugs" : null));

  if (!targetTab) return false;

  // Освобождаем рабочую область перед переходом к ошибке в карточке.
  document.dispatchEvent(new Event("app:close-report-panel"));

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

/** Возвращает пользователя к первому кейсу из предупреждения. */
function revealFirstMissingResult(problem) {
  document.dispatchEvent(new Event("app:close-report-panel"));
  const activeTab = document.querySelector(".tab.active")?.dataset.tab || "cases";
  if (activeTab !== "cases") document.querySelector('.tab[data-tab="cases"]')?.click();

  const field = resultFieldFor(problem.index);
  if (!field) return;

  field.classList.remove("result-warning-focus");
  void field.offsetWidth;
  field.classList.add("result-warning-focus");
  window.setTimeout(() => field.classList.remove("result-warning-focus"), RESULT_WARNING_HIGHLIGHT_MS);

  scrollProblemIntoView({
    container: field,
    focusTarget: field.querySelector("textarea"),
    viewportRatio: RESULT_WARNING_VIEWPORT_RATIO,
  });
}

/**
 * Предупреждает о Failed-кейсах без фактического результата.
 * Это не блокирующая ошибка: пользователь может продолжить выбранную загрузку.
 */
async function confirmMissingFailedResults(outputFormat) {
  if (currentDraft._preferences?.[SKIP_FAILED_RESULTS_WARNING] === true) return true;

  const problems = collectFailedCasesWithoutResults();
  if (!problems.length) return true;

  const plural = problems.length > 1;
  const decision = await confirmAction({
    title: plural
      ? "Для Failed-кейсов нет результатов тестирования"
      : "Для Failed-кейса нет результата тестирования",
    description: plural
      ? "Статус Failed показывает, что тест не пройден. В кейсах ниже нет ни результатов тестирования, ни изображений, поэтому из отчёта будет непонятно, почему тесты не пройдены и каковы их фактические результаты:"
      : "Статус Failed показывает, что тест не пройден. В кейсе ниже нет ни результата тестирования, ни изображения, поэтому из отчёта будет непонятно, почему тест не пройден и каков его фактический результат:",
    items: problems.map((problem) => ({
      label: `№${problem.index + 1}`,
      text: problem.name,
    })),
    note: plural
      ? "Вы можете вернуться и дополнить кейсы или скачать отчёт без этих данных."
      : "Вы можете вернуться и дополнить кейс или скачать отчёт без этих данных.",
    checkboxLabel: "Больше не показывать для этого отчёта",
    cancelLabel: "Вернуться к отчёту",
    confirmLabel: `Всё равно скачать ${outputFormat.toUpperCase()}`,
    cancelResult: "return",
    confirmResult: "download",
    dismissResult: null,
    danger: false,
    variant: "report-warning",
    restoreFocus: false,
  });

  // Escape и клик по фону только закрывают окно: без сохранения настройки,
  // прокрутки и подсветки.
  if (!decision) return false;

  if (decision.checkboxChecked) {
    currentDraft._preferences = {
      ...(currentDraft._preferences || {}),
      [SKIP_FAILED_RESULTS_WARNING]: true,
    };
    scheduleSave();
  }

  if (decision.action === "return") {
    revealFirstMissingResult(problems[0]);
    return false;
  }
  return decision.action === "download";
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
  // Поля шапки проверяем первыми: они видны всегда, а ошибки карточек могут
  // потребовать переключения вкладки и прокрутки.
  if (!validateProject()) return;
  if (!validateReportTitle()) return;
  if (!validateReportDate()) return;

  const requiredFieldProblems = collectRequiredFieldProblems();
  if (highlightRequiredFields(requiredFieldProblems)) return;
  if (!await confirmMissingFailedResults(outputFormat)) return;

  const buttonLabel = byId("generateReportLabel");
  const originalLabel = buttonLabel.textContent;
  setButtonsBusy(true);
  button.classList.add("is-busy");
  buttonLabel.textContent = `Формируем ${outputFormat.toUpperCase()}…`;
  byId("statusMsg").classList.remove("error");
  setStatusMessage("");

  try {
    await saveNow();
    if (!currentDraft._id) {
      setStatusMessage("Нечего скачивать");
      return;
    }

    const { file } = await api.buildReport(outputFormat, currentDraft);
    button.classList.remove("is-busy");
    button.classList.add("is-ready");
    buttonLabel.textContent = `${outputFormat.toUpperCase()} готов`;
    await new Promise((resolve) => window.setTimeout(resolve, REPORT_READY_STATE_MS));
    triggerDownload(api.reportUrl(currentDraft._id, file));
  } catch (error) {
    const message = `Ошибка: ${String(error.message).slice(0, 160)}`;
    setStatusMessage(message);
    showToast(message, { kind: "error", timeout: 6500 });
  } finally {
    button.classList.remove("is-busy", "is-ready");
    buttonLabel.textContent = originalLabel;
    setButtonsBusy(false);
    refreshDownloadButtons();
  }
}

export function initDownloadButtons() {
  byId("generateReport").addEventListener("click", (event) => {
    downloadReport(getSelectedReportFormat(), event.currentTarget);
  });
}
