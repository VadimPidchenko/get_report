// Плавающее окно с метаданными, составом и форматом итогового отчёта.

import { byId, pluralize } from "./dom.js";
import { currentDraft } from "./state.js";
import { scheduleSave } from "./draft-persistence.js";
import { setStatusMessage } from "./notifications.js";
import {
  clearCardHighlight,
  getHighlightedCard,
  highlightCard as highlightNavigatedCard,
  scrollCardIntoView,
} from "./card-navigation.js?v=motion-navigation-3";

const PANEL_OPEN_CLASS = "report-panel-open";
const PANEL_CLOSING_CLASS = "report-panel-closing";
const PANEL_TRANSITION_MS = 300;

let navigationDraft = null;
let panelClosingTimer = null;
const lastStatusTargets = new Map();
let highlightedTarget = null;

const formatLabel = (format) => `Сформировать и скачать ${format.toUpperCase()}`;

function selectedFormat() {
  return document.querySelector('input[name="reportFormat"]:checked')?.value || "pdf";
}

function setPanelOpen(isOpen, { focusTitle = false } = {}) {
  const panel = byId("reportPanel");
  const trigger = byId("reportPanelTrigger");

  window.clearTimeout(panelClosingTimer);
  panelClosingTimer = null;
  document.body.classList.remove(PANEL_CLOSING_CLASS);

  if (!isOpen && document.body.classList.contains(PANEL_OPEN_CLASS)) {
    // Сохраняем окончательные размеры панели до конца fade/slide-out. Без этого
    // содержимое успевает сжаться в нулевую колонку раньше, чем станет невидимым.
    document.body.classList.add(PANEL_CLOSING_CLASS);
    panelClosingTimer = window.setTimeout(() => {
      document.body.classList.remove(PANEL_CLOSING_CLASS);
      panelClosingTimer = null;
    }, PANEL_TRANSITION_MS);
  }

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

function statusNavigationKey(itemType, status) {
  return `${itemType}:${status || "none"}`;
}

function updateStatusIndicator(id, count, itemType, statusLabel) {
  const value = byId(id);
  const button = value?.closest("[data-status-value]");
  if (!value || !button) return;

  value.textContent = count;
  button.disabled = count === 0;
  const itemLabel = itemType === "case"
    ? pluralize(count, "тест-кейс", "тест-кейса", "тест-кейсов")
    : pluralize(count, "баг-репорт", "баг-репорта", "баг-репортов");
  const emptyItemLabel = itemType === "case" ? "тест-кейсов" : "баг-репортов";
  button.setAttribute(
    "aria-label",
    count
      ? `${statusLabel}: ${count} ${itemLabel}. Перейти к следующему`
      : `${statusLabel}: подходящих ${emptyItemLabel} нет`,
  );
}

function clearHighlightedCard() {
  clearCardHighlight();
  highlightedTarget = null;
}

function highlightCard(card, itemType, item, status) {
  clearHighlightedCard();

  highlightedTarget = { itemType, item, status, card };
  highlightNavigatedCard(card);
}

function clearStaleHighlight() {
  if (!highlightedTarget) return;

  if (getHighlightedCard() !== highlightedTarget.card) {
    highlightedTarget = null;
    return;
  }

  const items = highlightedTarget.itemType === "case"
    ? currentDraft.cases
    : currentDraft.bugs;
  const stillMatches = items.includes(highlightedTarget.item)
    && (highlightedTarget.item.status || "") === highlightedTarget.status;
  if (!stillMatches) clearHighlightedCard();
}

function navigateToStatus(itemType, status, statusLabel, button) {
  if (navigationDraft !== currentDraft) {
    navigationDraft = currentDraft;
    lastStatusTargets.clear();
  }

  const items = itemType === "case" ? currentDraft.cases : currentDraft.bugs;
  const matches = items.filter((item) => (item.status || "") === status);
  if (!matches.length) {
    button.disabled = true;
    const itemLabel = itemType === "case" ? "Тест-кейсов" : "Баг-репортов";
    setStatusMessage(`${itemLabel} со статусом ${statusLabel} нет`, 3000);
    return;
  }

  const key = statusNavigationKey(itemType, status);
  const lastTarget = lastStatusTargets.get(key);
  const lastIndex = matches.indexOf(lastTarget);
  const targetItem = matches[(lastIndex + 1) % matches.length];
  lastStatusTargets.set(key, targetItem);

  const targetIndex = items.indexOf(targetItem);
  const targetTab = itemType === "case" ? "cases" : "bugs";
  const activeTab = document.querySelector(".tab.active")?.dataset.tab;
  if (activeTab !== targetTab) {
    document.querySelector(`.tab[data-tab="${targetTab}"]`)?.click();
  }

  const card = document.querySelector(
    `.card[data-item-type="${itemType}"][data-item-index="${targetIndex}"]`,
  );
  if (!card) {
    setStatusMessage("Не удалось найти карточку. Обновите страницу и повторите попытку", 3000);
    return;
  }

  highlightCard(card, itemType, targetItem, status);
  scrollCardIntoView(card);
  button.focus({ preventScroll: true });
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

  if (navigationDraft && navigationDraft !== currentDraft) {
    navigationDraft = currentDraft;
    lastStatusTargets.clear();
    clearHighlightedCard();
  } else {
    clearStaleHighlight();
  }

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
  updateStatusIndicator("statPassed", statusCounts.Passed, "case", "Passed");
  updateStatusIndicator("statFailed", statusCounts.Failed, "case", "Failed");
  updateStatusIndicator("statBlocked", statusCounts.Blocked, "case", "Blocked");
  updateStatusIndicator("statSkipped", statusCounts.Skipped, "case", "Skipped");
  updateStatusIndicator("statNone", statusCounts.none, "case", "No status");
  updateStatusIndicator("statBugDone", bugStatusCounts.Done, "bug", "Done");
  updateStatusIndicator("statBugInProgress", bugStatusCounts["In Progress"], "bug", "In Progress");
  updateStatusIndicator("statBugToDo", bugStatusCounts["To Do"], "bug", "To Do");
  updateStatusIndicator("statBugBacklog", bugStatusCounts.Backlog, "bug", "Backlog");
  updateStatusIndicator("statBugNone", bugStatusCounts.none, "bug", "No status");
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
    const statusButton = event.target.closest("[data-status-value]");
    if (statusButton) {
      navigateToStatus(
        statusButton.dataset.statusItemType,
        statusButton.dataset.statusValue,
        statusButton.dataset.statusLabel,
        statusButton,
      );
      return;
    }

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
  document.addEventListener("pointerdown", clearHighlightedCard);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    clearHighlightedCard();
    if (!document.body.classList.contains(PANEL_OPEN_CLASS)) return;
    if (byId("reportPanelClose").disabled) return;
    if (document.querySelector(".dialog-layer.open, .project-dropdown.open, .status-dropdown.open")) return;
    closeReportPanel({ restoreFocus: true });
  });

  syncFormatLabel();
}

export const getSelectedReportFormat = selectedFormat;
