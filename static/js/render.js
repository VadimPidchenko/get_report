// Отрисовка карточек тест-кейсов и баг-репортов.
//
// Разметка собирается строками, а события обслуживаются делегированными
// обработчиками модулей-владельцев через классы и data-атрибуты.

import { byId, escapeHtml, autoGrowAllTextareas, pluralize } from "./dom.js";
import { currentDraft } from "./state.js";
import { draftBadge, formatDay } from "./draft-meta.js";
import * as api from "./api.js";

const CASE_STATUSES = ["Passed", "Failed", "Blocked", "Skipped"];
const BUG_STATUSES = ["To Do", "In Progress", "Done", "Backlog"];

const STATUS_CLASSES = {
  Passed: "passed",
  Failed: "failed",
  Blocked: "blocked",
  Skipped: "skipped",
  "To Do": "to-do",
  "In Progress": "in-progress",
  Done: "done",
  Backlog: "backlog",
};

/** CSS-модификатор выбранного статуса. Пустое значение остаётся нейтральным. */
export const statusClass = (status) => STATUS_CLASSES[status] || "none";

/** Черновик, который предлагается восстановить при запуске. */
let resumeCandidate = null;

export function setResumeCandidate(draft) {
  resumeCandidate = draft;
}

export function clearResumeCandidate() {
  resumeCandidate = null;
}

export const getResumeCandidate = () => resumeCandidate;

/**
 * Поле-список: несколько пунктов, каждый в своём вводе с номером слева.
 * Пункты добавляются кнопкой под последним полем, удаляются крестиком.
 * Крестик у единственного пункта скрыт — хотя бы одно поле остаётся всегда.
 */
export function renderListField(items, itemType, itemIndex, fieldName, addLabel) {
  const values = items && items.length ? items : [""];
  const single = values.length === 1;

  const rows = values.map((value, pointIndex) => `
    <div class="list-item" data-point-index="${pointIndex}">
      <span class="list-num">${pointIndex + 1}.</span>
      <textarea rows="1">${escapeHtml(value)}</textarea>
      <button class="list-del ${single ? "hidden" : ""}" data-action="remove-list-item"
        aria-label="Удалить пункт" title="Удалить пункт"><span aria-hidden="true">×</span></button>
    </div>`).join("");

  return `
    <div class="list-field"
         data-item-type="${itemType}"
         data-item-index="${itemIndex}"
         data-field-name="${fieldName}"
         data-add-label="${escapeHtml(addLabel)}">
      ${rows}
      <button class="list-add" data-action="add-list-item">+ ${addLabel}</button>
    </div>`;
}

/**
 * Поле-список вместе со строкой и заголовком слева.
 * У «Ожидаемого» и «Результата» строка своя — там рядом со списком идут
 * ещё и картинки, поэтому они собирают её сами из renderListField.
 */
function renderListRow(items, itemType, itemIndex, fieldName, label, addLabel) {
  return `
    <div class="row"><label>${label}</label>
      ${renderListField(items, itemType, itemIndex, fieldName, addLabel)}
    </div>`;
}

/** Блок с картинками поля: превью, кнопка добавления и зона перетаскивания. */
function renderImageField(images, itemType, itemIndex, fieldName) {
  const dropzoneId = `dz-${itemType}-${itemIndex}-${fieldName}`;
  const draftId = currentDraft._id;

  const previews = (images || []).map((image, imageIndex) => `
    <div class="shot" data-image-index="${imageIndex}">
      <button class="x" data-action="remove-image">×</button>
      <img src="${draftId ? api.imageUrl(draftId, image.file) : ""}" alt="">
      <button type="button" class="cap ${image.caption ? "" : "empty"}"
           data-action="edit-caption">
        ${image.caption ? escapeHtml(image.caption) : "+ подпись"}
      </button>
    </div>`).join("");

  return `
    <div class="dropzone" id="${dropzoneId}" tabindex="0"
         data-type="${itemType}" data-i="${itemIndex}" data-field="${fieldName}">
      <div class="shots">
        ${previews}
        <button class="add-shot" data-action="pick-image">
          <span class="ic">🖼</span><span>Добавить изображение</span>
        </button>
      </div>
      <div class="dz-hint">
        <span class="idle">png / jpg · перетащите файл или кликните сюда</span>
        <span class="ready">Ctrl+V — вставить скриншот из буфера</span>
      </div>
      <div class="dz-error" style="display:none"></div>
    </div>`;
}

function renderStatusSelect(itemType, itemIndex, currentStatus, options) {
  const allOptions = ["", ...options];
  const choices = allOptions
    .map((status) => {
      const label = status || "Не выбран";
      const selected = currentStatus === status;
      return `
        <button type="button" role="option" aria-selected="${selected}"
                class="status-option status-${statusClass(status)} ${selected ? "selected" : ""}"
                data-action="choose-status" data-status="${status}">
          <span class="status-dot"></span>${label}
        </button>`;
    })
    .join("");
  return `
    <div id="status-${itemType}-${itemIndex}"
         class="status-dropdown status-${statusClass(currentStatus)}">
      <button type="button" class="status-trigger" aria-haspopup="listbox" aria-expanded="false"
              data-action="toggle-status">
        <span class="status-label">${currentStatus || "Не выбран"}</span>
        <span class="status-arrow"></span>
      </button>
      <div class="status-options" role="listbox">
        ${choices}
      </div>
    </div>`;
}

/** Общее меню действий карточки кейса или бага. */
function renderItemActions(itemType) {
  const itemLabel = itemType === "case" ? "кейсом" : "багом";
  const deleteLabel = itemType === "case" ? "Удалить кейс" : "Удалить баг";

  return `
    <div class="item-actions">
      <button class="item-menu-trigger" type="button"
              aria-label="Действия с ${itemLabel}" aria-haspopup="menu" aria-expanded="false"
              data-action="toggle-item-menu">
        <span class="dots-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <circle cx="10" cy="4.25" r="1.6"></circle>
            <circle cx="10" cy="10" r="1.6"></circle>
            <circle cx="10" cy="15.75" r="1.6"></circle>
          </svg>
        </span>
      </button>
      <div class="item-menu" role="menu">
        <button type="button" role="menuitem" data-action="duplicate-item">
          <span class="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="8" y="8" width="11" height="11" rx="2"></rect>
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
            </svg>
          </span>
          <span>Дублировать</span>
        </button>
        <div class="item-menu-separator" aria-hidden="true"></div>
        <button type="button" role="menuitem" class="danger" data-action="remove-item"
                aria-label="${deleteLabel}">
          <span class="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4.5 7h15M9 7V4.8h6V7m-8.7 0 .8 12h9.8l.8-12M10 10.5v5M14 10.5v5"></path>
            </svg>
          </span>
          <span>Удалить</span>
        </button>
      </div>
    </div>`;
}

function renderTestCase(testCase, index) {
  return `
  <div class="card" data-item-type="case" data-item-index="${index}">
    <div class="card-head">
      <div class="idx">${index + 1}</div>
      <input class="title" id="title-case-${index}" placeholder="Название кейса" autocomplete="off"
             data-field-name="name" value="${escapeHtml(testCase.name)}">
      ${renderItemActions("case")}
    </div>

    ${renderListRow(testCase.tasks, "case", index, "tasks", "Задачи", "Добавить задачу")}

    ${renderListRow(testCase.precondition, "case", index, "precondition", "Предусловие", "Добавить предусловие")}

    ${renderListRow(testCase.steps, "case", index, "steps", "Шаги", "Добавить шаг")}

    <div class="row"><label>Ожидаемый<br>результат</label>
      <div>
        ${renderListField(testCase.expected, "case", index, "expected", "Добавить пункт")}
        <div class="field-body">${renderImageField(testCase.expected_images, "case", index, "expected_images")}</div>
      </div></div>

    <div class="row"><label>Результат<br>тестирования</label>
      <div>
        ${renderListField(testCase.result, "case", index, "result", "Добавить пункт")}
        <div class="field-body">${renderImageField(testCase.result_images, "case", index, "result_images")}</div>
      </div></div>

    <div class="row"><label>Статус</label>
  <div class="field-body">${renderStatusSelect("case", index, testCase.status, CASE_STATUSES)}</div></div>
  </div>`;
}

function renderBug(bug, index) {
  return `
  <div class="card" data-item-type="bug" data-item-index="${index}">
    <div class="card-head">
      <div class="idx">${index + 1}</div>
      <input class="title" id="title-bug-${index}" placeholder="Название бага" autocomplete="off"
             data-field-name="title" value="${escapeHtml(bug.title)}">
      ${renderItemActions("bug")}
    </div>

    ${renderListRow(bug.tasks, "bug", index, "tasks", "Задачи", "Добавить задачу")}

    <div class="row"><label>Описание</label>
        <div class="field-body"><textarea rows="3" data-field-name="desc">${escapeHtml(bug.desc)}</textarea></div></div>

    <div class="row"><label>Скрины</label>
      <div class="field-body">${renderImageField(bug.images, "bug", index, "images")}</div></div>

    <div class="row"><label>Статус</label>
        <div class="field-body">${renderStatusSelect("bug", index, bug.status, BUG_STATUSES)}</div></div>
  </div>`;
}

/**
 * Предложение вернуться к прошлому черновику.
 * Показывается только на пустой странице: как только появился первый кейс,
 * подсказка теряет смысл и исчезает сама.
 */
function renderResumeBar() {
  if (!resumeCandidate) return "";
  if (currentDraft.cases.length || currentDraft.bugs.length) return "";

  const caseCount = (resumeCandidate.cases || []).length;
  const caseWord = pluralize(caseCount, "кейс", "кейса", "кейсов");

  // те же метка и дата, что в карточке боковой панели: по ним отчёт и узнают,
  // не проваливаясь внутрь. Строка метаданных короче — здесь важен не разбор
  // содержимого, а ответ на вопрос «тот ли это отчёт»
  const badge = draftBadge(resumeCandidate.project);

  return `
    <div class="resume-bar">
      <span class="ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="8.25"></circle>
          <path d="M12 7.5v5l3.25 2"></path>
        </svg>
      </span>
      <span class="txt">
        <span class="resume-label">Последний открытый отчёт</span>
        <span class="resume-main">
          <span class="name">${escapeHtml(resumeCandidate._title || "без названия")}</span>
          <span class="badge ${badge.kind}">${escapeHtml(badge.label)}</span>
        </span>
        <span class="resume-meta"><span>${escapeHtml(formatDay(resumeCandidate.date))}</span><span>· ${caseCount} ${caseWord}</span></span>
      </span>
      <span class="resume-actions">
        <button class="go" data-action="resume-last-draft">Продолжить</button>
        <button class="cls" data-action="dismiss-resume-bar" title="Скрыть" aria-label="Скрыть предложение продолжить отчёт">✕</button>
      </span>
    </div>`;
}

export function renderItemCard(itemType, item, index) {
  return itemType === "case" ? renderTestCase(item, index) : renderBug(item, index);
}

export function renderEmptyState(kind) {
  const isCases = kind === "case";
  return `
    <div class="empty-state" role="status">
      <div class="empty-title">${isCases ? "Нет тест-кейсов" : "Нет баг-репортов"}</div>
      <div class="empty-copy">${isCases
        ? "Добавьте первый кейс, чтобы начать формировать отчёт."
        : "Добавьте баг, если во время тестирования обнаружена проблема."}</div>
    </div>`;
}

/** Колбэки, которые нужно вызвать после каждой перерисовки. */
const afterRenderHooks = [];

export function onAfterRender(callback) {
  afterRenderHooks.push(callback);
}

/** Перерисовывает обе вкладки и служебные элементы. */
export function render() {
  const casesContent = currentDraft.cases.length
    ? currentDraft.cases.map(renderTestCase).join("")
    : renderEmptyState("case");
  const bugsContent = currentDraft.bugs.length
    ? currentDraft.bugs.map(renderBug).join("")
    : renderEmptyState("bug");

  byId("casesPane").innerHTML =
    casesContent
    + `<button class="add-case" data-action="add-item" data-item-type="case">+ Добавить кейс</button>`
    + renderResumeBar();

  byId("bugsPane").innerHTML =
    bugsContent
    + `<button class="add-case" data-action="add-item" data-item-type="bug">+ Добавить баг</button>`;

  byId("cCount").textContent = currentDraft.cases.length;
  byId("bCount").textContent = currentDraft.bugs.length;

  autoGrowAllTextareas();
  afterRenderHooks.forEach((hook) => hook());
}

/**
 * Проект в шапке.
 *
 * Список закрытый, но в старых отчётах может лежать значение не из него.
 * Такое значение подставляем отдельным пунктом: иначе селект показал бы пустоту,
 * а автосохранение молча записало бы её вместо проекта.
 */
function syncProjectSelect(value) {
  const select = byId("project");
  select.querySelector("option.legacy")?.remove();

  const isKnown = Array.from(select.options).some((option) => option.value === value);
  if (value && !isKnown) {
    const option = document.createElement("option");
    option.className = "legacy";
    option.value = value;
    option.textContent = value;
    select.append(option);
  }

  select.value = value;

  const dropdown = byId("projectDropdown");
  dropdown?.querySelector(".project-option.legacy")?.remove();
  const triggerLabel = dropdown?.querySelector(".project-label");
  if (triggerLabel) triggerLabel.textContent = value || "—";

  dropdown?.querySelectorAll(".project-option").forEach((option) => {
    const selected = option.dataset.value === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });

  if (value && !dropdown?.querySelector(`.project-option[data-value="${CSS.escape(value)}"]`)) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "project-option selected legacy";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "true");
    option.dataset.value = value;
    option.textContent = value;
    byId("projectOptions")?.append(option);
  }
}

/** Обновляет поля шапки под текущий черновик. */
export function syncHeader() {
  syncProjectSelect(currentDraft.project || "");
  byId("date").value = currentDraft.date || "";
  byId("jira").value = currentDraft.jira_base || "";
  byId("draftName").textContent = currentDraft._title || "Новый отчёт (не сохранён)";
}
