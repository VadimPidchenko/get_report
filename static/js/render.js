// Отрисовка карточек тест-кейсов и баг-репортов.
//
// Разметка собирается строками, поэтому обработчики навешиваются через
// атрибуты onclick — функции для них публикуются в app.js.

import { byId, escapeHtml, autoGrowAllTextareas, pluralize } from "./dom.js";
import { currentDraft } from "./state.js";
import { draftBadge, formatDay } from "./draft-meta.js";
import * as api from "./api.js";

export const CASE_STATUSES = ["Passed", "Failed", "Blocked", "Skipped"];
export const BUG_STATUSES = ["To Do", "In Progress", "Done", "Backlog"];

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
    <div class="list-item">
      <span class="list-num">${pointIndex + 1}.</span>
      <textarea rows="1"
        oninput="updateListItem('${itemType}',${itemIndex},'${fieldName}',${pointIndex},this.value)"
      >${escapeHtml(value)}</textarea>
      <button class="list-del ${single ? "hidden" : ""}"
        onclick="removeListItem('${itemType}',${itemIndex},'${fieldName}',${pointIndex})"
        title="Удалить">✕</button>
    </div>`).join("");

  return `
    <div class="list-field"
         data-item-type="${itemType}"
         data-item-index="${itemIndex}"
         data-field-name="${fieldName}"
         data-add-label="${escapeHtml(addLabel)}">
      ${rows}
      <button class="list-add"
        onclick="addListItem('${itemType}',${itemIndex},'${fieldName}')">+ ${addLabel}</button>
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
    <div class="shot">
      <button class="x" onclick="removeImage('${itemType}',${itemIndex},'${fieldName}',${imageIndex})">×</button>
      <img src="${draftId ? api.imageUrl(draftId, image.file) : ""}" alt="">
      <button type="button" class="cap ${image.caption ? "" : "empty"}"
           data-image-index="${imageIndex}"
           onclick="event.stopPropagation(); editCaption('${itemType}',${itemIndex},'${fieldName}',${imageIndex})">
        ${image.caption ? escapeHtml(image.caption) : "+ подпись"}
      </button>
    </div>`).join("");

  return `
    <div class="dropzone" id="${dropzoneId}" tabindex="0"
         data-type="${itemType}" data-i="${itemIndex}" data-field="${fieldName}">
      <div class="shots">
        ${previews}
        <button class="add-shot" onclick="pickImageFile('${itemType}',${itemIndex},'${fieldName}')">
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
                onclick="chooseStatus('${itemType}',${itemIndex},'${status}',this,event)">
          <span class="status-dot"></span>${label}
        </button>`;
    })
    .join("");
  return `
    <div id="status-${itemType}-${itemIndex}"
         class="status-dropdown status-${statusClass(currentStatus)}">
      <button type="button" class="status-trigger" aria-haspopup="listbox" aria-expanded="false"
              onclick="toggleStatusDropdown(this.parentElement,event)">
        <span class="status-label">${currentStatus || "Не выбран"}</span>
        <span class="status-arrow"></span>
      </button>
      <div class="status-options" role="listbox">
        ${choices}
      </div>
    </div>`;
}

function renderTestCase(testCase, index) {
  return `
  <div class="card" data-item-type="case" data-item-index="${index}">
    <div class="card-head">
      <div class="idx">${index + 1}</div>
      <input class="title" id="title-case-${index}" placeholder="Название кейса"
             value="${escapeHtml(testCase.name)}"
             oninput="updateField('case',${index},'name',this.value); clearFieldError(this)">
      <button class="del" onclick="removeItem('case',${index})" title="Удалить">✕</button>
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
      <input class="title" id="title-bug-${index}" placeholder="Название бага"
             value="${escapeHtml(bug.title)}"
             oninput="updateField('bug',${index},'title',this.value); clearFieldError(this)">
      <button class="del" onclick="removeItem('bug',${index})">✕</button>
    </div>

    ${renderListRow(bug.tasks, "bug", index, "tasks", "Задачи", "Добавить задачу")}

    <div class="row"><label>Описание</label>
        <div class="field-body"><textarea rows="3" oninput="updateField('bug',${index},'desc',this.value)">${escapeHtml(bug.desc)}</textarea></div></div>

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
      <span class="ic">🕘</span>
      <span class="txt">
        <span class="resume-main">Последний отчёт:
          <span class="name">${escapeHtml(resumeCandidate._title || "без названия")}</span>
          <span class="badge ${badge.kind}">${escapeHtml(badge.label)}</span>
        </span>
        <span class="resume-meta"><span>${escapeHtml(formatDay(resumeCandidate.date))}</span><span>· ${caseCount} ${caseWord}</span></span>
      </span>
      <button class="go" onclick="resumeLastDraft()">Продолжить</button>
      <button class="cls" onclick="dismissResumeBar()" title="Скрыть">✕</button>
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
    + `<button class="add-case" onclick="addItem('case')">+ Добавить кейс</button>`
    + renderResumeBar();

  byId("bugsPane").innerHTML =
    bugsContent
    + `<button class="add-case" onclick="addItem('bug')">+ Добавить баг</button>`;

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
