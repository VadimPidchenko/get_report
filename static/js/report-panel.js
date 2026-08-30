// Плавающее окно с метаданными, составом и форматом итогового отчёта.

import { byId, pluralize } from "./dom.js";
import { currentDraft } from "./state.js";
import { scheduleSave } from "./draft-persistence.js";

const PANEL_OPEN_CLASS = "report-panel-open";
const PANEL_TRANSITION_MS = 260;

const formatLabel = (format) => `Сформировать и скачать ${format.toUpperCase()}`;

function selectedFormat() {
  return document.querySelector('input[name="reportFormat"]:checked')?.value || "pdf";
}

function setPanelOpen(isOpen, { focusTitle = false } = {}) {
  const panel = byId("reportPanel");
  const trigger = byId("reportPanelTrigger");

  document.body.classList.toggle(PANEL_OPEN_CLASS, isOpen);
  panel.setAttribute("aria-hidden", String(!isOpen));
  trigger.setAttribute("aria-expanded", String(isOpen));

  if (!isOpen) return;

  document.dispatchEvent(new Event("app:close-competing-menus"));
  const focusTarget = focusTitle ? byId("reportTitle") : byId("reportPanelClose");
  window.setTimeout(() => focusTarget?.focus({ preventScroll: true }), PANEL_TRANSITION_MS);
}

export function openReportPanel(options = {}) {
  setPanelOpen(true, options);
}

export function closeReportPanel({ restoreFocus = false } = {}) {
  if (!document.body.classList.contains(PANEL_OPEN_CLASS)) return;
  setPanelOpen(false);
  if (restoreFocus) byId("reportPanelTrigger")?.focus({ preventScroll: true });
}

function toggleReportPanel() {
  const isOpen = document.body.classList.contains(PANEL_OPEN_CLASS);
  if (isOpen) closeReportPanel({ restoreFocus: true });
  else openReportPanel();
}

function countLabel(count, words) {
  return `${count} ${pluralize(count, ...words)}`;
}

function selectCompositionTab(name) {
  document.querySelectorAll("[data-composition-tab]").forEach((tab) => {
    const isSelected = tab.dataset.compositionTab === name;
    tab.classList.toggle("active", isSelected);
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });

  byId("compositionCasesPanel").hidden = name !== "cases";
  byId("compositionBugsPanel").hidden = name !== "bugs";
}

/** Обновляет пассивный контекст и статистику под текущее состояние черновика. */
export function refreshReportPanel() {
  if (!currentDraft) return;

  byId("contextProject").textContent = currentDraft.project || "No project";
  byId("contextDate").textContent = currentDraft.date || "Дата не указана";

  const cases = currentDraft.cases || [];
  const bugs = currentDraft.bugs || [];
  const statusCounts = {
    Passed: 0,
    Failed: 0,
    Blocked: 0,
    Skipped: 0,
    none: 0,
  };
  const bugStatusCounts = {
    Done: 0,
    "In Progress": 0,
    "To Do": 0,
    Backlog: 0,
    none: 0,
  };

  cases.forEach((testCase) => {
    const key = Object.hasOwn(statusCounts, testCase.status) ? testCase.status : "none";
    statusCounts[key] += 1;
  });
  bugs.forEach((bug) => {
    const key = Object.hasOwn(bugStatusCounts, bug.status) ? bug.status : "none";
    bugStatusCounts[key] += 1;
  });

  byId("compositionCasesCount").textContent = cases.length;
  byId("compositionBugsCount").textContent = bugs.length;
  byId("compositionCasesTotal").textContent = countLabel(cases.length, ["тест-кейс", "тест-кейса", "тест-кейсов"]);
  byId("compositionBugsTotal").textContent = countLabel(bugs.length, ["баг-репорт", "баг-репорта", "баг-репортов"]);
  byId("statPassed").textContent = statusCounts.Passed;
  byId("statFailed").textContent = statusCounts.Failed;
  byId("statBlocked").textContent = statusCounts.Blocked;
  byId("statSkipped").textContent = statusCounts.Skipped;
  byId("statNone").textContent = statusCounts.none;
  byId("statBugDone").textContent = bugStatusCounts.Done;
  byId("statBugInProgress").textContent = bugStatusCounts["In Progress"];
  byId("statBugToDo").textContent = bugStatusCounts["To Do"];
  byId("statBugBacklog").textContent = bugStatusCounts.Backlog;
  byId("statBugNone").textContent = bugStatusCounts.none;
}

function syncFormatLabel() {
  byId("generateReportLabel").textContent = formatLabel(selectedFormat());
}

function updateTitle(value) {
  currentDraft._title = value;
  byId("draftName").textContent = value || "Новый отчёт (не сохранён)";
  byId("reportTitle").classList.remove("invalid");
  byId("reportTitle").removeAttribute("aria-invalid");
  byId("draftName").classList.remove("invalid");
  byId("draftName").removeAttribute("aria-invalid");
  scheduleSave();
}

export function initReportPanel() {
  byId("reportPanelTrigger").addEventListener("click", toggleReportPanel);
  byId("reportPanelClose").addEventListener("click", () => closeReportPanel({ restoreFocus: true }));

  byId("reportTitle").addEventListener("input", (event) => updateTitle(event.target.value));
  byId("reportFormatFields").addEventListener("change", syncFormatLabel);
  byId("reportCompositionControls").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-composition-tab]");
    if (tab) selectCompositionTab(tab.dataset.compositionTab);
  });
  byId("reportCompositionControls").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-composition-tab]")];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;

    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length];
    selectCompositionTab(nextTab.dataset.compositionTab);
    nextTab.focus();
  });

  document.addEventListener("app:draft-changed", refreshReportPanel);
  document.addEventListener("app:open-report-panel", (event) => {
    openReportPanel({ focusTitle: event.detail?.focus === "title" });
  });
  document.addEventListener("app:close-report-panel", () => closeReportPanel());

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !document.body.classList.contains(PANEL_OPEN_CLASS)) return;
    if (byId("reportPanelClose").disabled) return;
    if (document.querySelector(".dialog-layer.open, .project-dropdown.open, .status-dropdown.open")) return;
    closeReportPanel({ restoreFocus: true });
  });

  syncFormatLabel();
}

export const getSelectedReportFormat = selectedFormat;
