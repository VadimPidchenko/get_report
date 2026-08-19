// Точка входа: запуск приложения и связывание модулей.

import * as api from "./api.js";
import {
    byId,
    autoGrowTextarea,
    autoGrowAllTextareas,
} from "./dom.js";
import {
  currentDraft,
  setCurrentDraft,
  itemsOf,
  createTestCase,
  createBug,
  scheduleSave,
  saveNow,
  onDraftSaved,
  LAST_DRAFT_STORAGE_KEY,
  getOpenDraftId,
  cleanupEmptyListItems,
  forgetOpenDraft,
} from "./state.js";
import {
  render,
  syncHeader,
  onAfterRender,
  setResumeCandidate,
  clearResumeCandidate,
  getResumeCandidate,
  statusClass,
  renderListField,
  renderItemCard,
  renderEmptyState,
} from "./render.js";
import {
  refreshDraftList,
  openSidebar,
  closeSidebar,
  openDraft,
  startNewDraft,
  renameDraft,
  deleteDraft,
  toggleDraftMenu,
  closeDraftMenus,
  renameCurrentDraft,
} from "./drafts.js";
import {
  initDragAndDrop,
  initPasteImages,
  pickImageFile,
  removeImage,
  editCaption,
} from "./images.js";
import {
  initDownloadButtons,
  refreshDownloadButtons,
  clearFieldError,
} from "./reports.js";
import { initDialogs } from "./dialogs.js";

// ─── правки содержимого ───

function updateField(itemType, itemIndex, fieldName, value) {
  itemsOf(itemType)[itemIndex][fieldName] = value;
  scheduleSave();
}

function closeProjectDropdown() {
  const dropdown = byId("projectDropdown");
  dropdown?.classList.remove("open");
  byId("projectTrigger")?.setAttribute("aria-expanded", "false");
}

function openProjectDropdown() {
  const dropdown = byId("projectDropdown");
  if (!dropdown) return;
  closeStatusDropdowns();
  dropdown.classList.add("open");
  byId("projectTrigger")?.setAttribute("aria-expanded", "true");
}

function chooseProject(value, { focusTrigger = true } = {}) {
  const select = byId("project");
  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));

  const dropdown = byId("projectDropdown");
  dropdown.querySelector(".project-label").textContent = value || "—";
  dropdown.querySelectorAll(".project-option").forEach((option) => {
    const selected = option.dataset.value === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });

  clearFieldError(dropdown);
  closeProjectDropdown();
  if (focusTrigger) byId("projectTrigger")?.focus();
}

function initProjectDropdown() {
  const trigger = byId("projectTrigger");
  const dropdown = byId("projectDropdown");

  trigger.onclick = (event) => {
    event.stopPropagation();
    if (dropdown.classList.contains("open")) closeProjectDropdown();
    else openProjectDropdown();
  };

  byId("projectOptions").onclick = (event) => {
    const option = event.target.closest(".project-option");
    if (!option) return;
    event.stopPropagation();
    chooseProject(option.dataset.value);
  };

  trigger.onkeydown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openProjectDropdown();
    const options = [...dropdown.querySelectorAll(".project-option:not([disabled])")];
    const selected = dropdown.querySelector(".project-option.selected");
    const index = Math.max(0, options.indexOf(selected));
    const target = event.key === "ArrowUp" ? options[Math.max(0, index - 1)] : options[Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : 0))];
    (target || selected || options[0])?.focus();
  };

  byId("projectOptions").onkeydown = (event) => {
    const options = [...dropdown.querySelectorAll(".project-option:not([disabled])")];
    const index = options.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      options[Math.max(0, Math.min(options.length - 1, index + delta))]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = document.activeElement.closest?.(".project-option");
      if (option) chooseProject(option.dataset.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeProjectDropdown();
      trigger.focus();
    }
  };
}

function closeStatusDropdowns(except = null) {
  document.querySelectorAll(".status-dropdown.open").forEach((dropdown) => {
    if (dropdown === except) return;
    dropdown.classList.remove("open");
    dropdown.querySelector(".status-trigger")?.setAttribute("aria-expanded", "false");
  });
}

/** Выбирает направление меню статуса так, чтобы оно не попадало под sticky footer. */
function positionStatusDropdown(dropdown) {
  const trigger = dropdown.querySelector(".status-trigger");
  const menu = dropdown.querySelector(".status-options");
  if (!trigger || !menu) return;

  dropdown.classList.remove("drop-up");
  const triggerRect = trigger.getBoundingClientRect();
  const footerTop = document.querySelector(".footbar")?.getBoundingClientRect().top ?? window.innerHeight;
  const menuHeight = menu.scrollHeight;
  const below = footerTop - triggerRect.bottom - 8;
  const above = triggerRect.top - 8;

  if (below < menuHeight && above > below) dropdown.classList.add("drop-up");
}

/** Открывает меню статуса и закрывает другое открытое меню. */
function toggleStatusDropdown(dropdown, event) {
  event.stopPropagation();
  closeProjectDropdown();
  const willOpen = !dropdown.classList.contains("open");
  closeStatusDropdowns(dropdown);
  // Направление вычисляем ДО показа меню. Иначе при первом открытии меню успевает
  // отрисоваться снизу и в следующий кадр перепрыгнуть наверх, что выглядит как рывок карточки.
  if (willOpen) positionStatusDropdown(dropdown);
  dropdown.classList.toggle("open", willOpen);
  dropdown.querySelector(".status-trigger")?.setAttribute("aria-expanded", String(willOpen));
}

/** Выбирает статус, закрывает меню и снимает мышиный фокус с поля. */
function chooseStatus(itemType, itemIndex, status, option, event) {
  event.stopPropagation();
  updateField(itemType, itemIndex, "status", status);

  const dropdown = option.closest(".status-dropdown");
  dropdown.classList.remove("open", "status-none", "status-passed", "status-done", "status-failed", "status-blocked", "status-in-progress", "status-skipped", "status-to-do", "status-backlog");
  dropdown.classList.add(`status-${statusClass(status)}`);
  dropdown.querySelector(".status-label").textContent = status || "Не выбран";
  dropdown.querySelector(".status-trigger").setAttribute("aria-expanded", "false");
  dropdown.querySelectorAll(".status-option").forEach((item) => {
    const selected = item === option;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-selected", String(selected));
  });

  clearFieldError(dropdown);
  dropdown.querySelector(".status-trigger")?.focus();
}

function initStatusDropdowns() {
  document.addEventListener("click", () => {
    closeStatusDropdowns();
    closeProjectDropdown();
    closeDraftMenus();
  });

  // Открытый popover не должен висеть поверх footer при прокрутке/изменении viewport.
  window.addEventListener("scroll", () => closeStatusDropdowns(), { passive: true });
  window.addEventListener("resize", () => closeStatusDropdowns(), { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openStatus = document.querySelector(".status-dropdown.open");
    const openProject = byId("projectDropdown")?.classList.contains("open");
    const openDraftMenu = document.querySelector(".draft-menu.open");
    if (openStatus) {
      closeStatusDropdowns();
      openStatus.querySelector(".status-trigger")?.focus();
    }
    if (openProject) {
      closeProjectDropdown();
      byId("projectTrigger")?.focus();
    }
    if (openDraftMenu) {
      const trigger = openDraftMenu.closest(".draft-item")?.querySelector(".draft-menu-trigger");
      closeDraftMenus();
      trigger?.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    const trigger = event.target.closest?.(".status-trigger");
    const option = event.target.closest?.(".status-option");
    const dropdown = event.target.closest?.(".status-dropdown");
    if (!dropdown || (!trigger && !option)) return;

    const options = [...dropdown.querySelectorAll(".status-option")];
    if (trigger && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      closeProjectDropdown();
      positionStatusDropdown(dropdown);
      dropdown.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      const selected = dropdown.querySelector(".status-option.selected");
      (selected || options[0])?.focus();
      return;
    }

    if (option && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const index = options.indexOf(option);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      options[Math.max(0, Math.min(options.length - 1, index + delta))]?.focus();
    }
  });
}

function updateListItem(itemType, itemIndex, fieldName, pointIndex, value) {
  itemsOf(itemType)[itemIndex][fieldName][pointIndex] = value;
  scheduleSave();
}

function rerenderListField(itemType, itemIndex, fieldName) {
  const selector = `.list-field[data-item-type="${itemType}"][data-item-index="${itemIndex}"][data-field-name="${fieldName}"]`;
  const field = document.querySelector(selector);
  if (!field) {
    // На случай рассинхронизации DOM безопасно откатываемся к полной перерисовке.
    render();
    return;
  }

  const addLabel = field.dataset.addLabel || "Добавить пункт";
  field.outerHTML = renderListField(
    itemsOf(itemType)[itemIndex][fieldName],
    itemType,
    itemIndex,
    fieldName,
    addLabel,
  );
}

function addListItem(itemType, itemIndex, fieldName) {
  itemsOf(itemType)[itemIndex][fieldName].push("");
  // Обновляем только конкретный список. Полная render() пересоздавала <img>
  // в карточке, из-за чего превью заметно мигали при добавлении обычного шага.
  rerenderListField(itemType, itemIndex, fieldName);
  animateLastListItem(itemType, itemIndex, fieldName);
  // фокус в только что добавленное поле — печатать можно сразу
  focusLastListItem(itemType, itemIndex, fieldName);
  scheduleSave();
}

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Height-aware motion for a single task/step/precondition row.
 * We measure the real row height, so multi-line values collapse without jumps.
 */
function animateListRow(row, direction = "in") {
  if (!row || prefersReducedMotion() || typeof row.animate !== "function") {
    return Promise.resolve();
  }

  const height = row.getBoundingClientRect().height;
  const entering = direction === "in";
  row.classList.add("motion-running");

  if (entering) {
    // Появление делим на две фазы.
    // 1) Сначала список освобождает место под новую строку. Сам input в этот
    //    момент полностью прозрачен, поэтому его border не «вырастает» из-под
    //    предыдущего поля.
    // 2) Когда почти вся высота уже раскрыта, готовая строка коротко проявляется.
    const layoutAnimation = row.animate(
      [
        { height: "0px", marginTop: "-8px" },
        { height: `${height}px`, marginTop: "0px" },
      ],
      {
        duration: 150,
        easing: "cubic-bezier(.2, .75, .25, 1)",
        fill: "both",
      },
    );

    const revealAnimation = row.animate(
      [
        { opacity: 0, transform: "translateY(-3px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 130,
        delay: 95,
        easing: "cubic-bezier(.2, .75, .25, 1)",
        fill: "both",
      },
    );

    return Promise.all([
      layoutAnimation.finished.catch(() => {}),
      revealAnimation.finished.catch(() => {}),
    ]).finally(() => {
      layoutAnimation.cancel();
      revealAnimation.cancel();
      row.classList.remove("motion-running");
    });
  }

  // Удаление — зеркальная пара к появлению.
  // Сначала готовая строка быстро и спокойно исчезает целиком (вместе с border),
  // затем освободившееся место схлопывается. Благодаря этому рамка input не
  // «складывается» на глазах и движение выглядит как обратная версия enter.
  const hideAnimation = row.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(-3px)" },
    ],
    {
      duration: 130,
      easing: "cubic-bezier(.2, .75, .25, 1)",
      fill: "both",
    },
  );

  const layoutAnimation = row.animate(
    [
      { height: `${height}px`, marginTop: "0px" },
      { height: "0px", marginTop: "-8px" },
    ],
    {
      duration: 150,
      delay: 95,
      easing: "cubic-bezier(.2, .75, .25, 1)",
      fill: "both",
    },
  );

  return Promise.all([
    hideAnimation.finished.catch(() => {}),
    layoutAnimation.finished.catch(() => {}),
  ]).finally(() => {
    hideAnimation.cancel();
    layoutAnimation.cancel();
    row.classList.remove("motion-running");
  });
}

function removeListItem(itemType, itemIndex, fieldName, pointIndex) {
  const list = itemsOf(itemType)[itemIndex][fieldName];
  const selector = `.list-field[data-item-type="${itemType}"][data-item-index="${itemIndex}"][data-field-name="${fieldName}"]`;
  const field = document.querySelector(selector);
  const target = field?.querySelectorAll(".list-item")[pointIndex];

  // During the short collapse keep DOM indexes stable, otherwise typing/clicking
  // another row could target the state index that is about to move.
  if (field?.dataset.removing === "true") return;
  if (field) {
    field.dataset.removing = "true";
    field.style.pointerEvents = "none";
  }

  const finish = () => {
    list.splice(pointIndex, 1);
    if (!list.length) list.push("");   // хотя бы один пункт всегда остаётся
    rerenderListField(itemType, itemIndex, fieldName);
    scheduleSave();
  };

  if (!target) {
    finish();
    return;
  }

  animateListRow(target, "out").then(finish);
}

/** Мягко показывает только что добавленный пункт списка. */
function animateLastListItem(itemType, itemIndex, fieldName) {
  const selector = `.list-field[data-item-type="${itemType}"][data-item-index="${itemIndex}"][data-field-name="${fieldName}"]`;
  const lastItem = document.querySelector(`${selector} .list-item:last-of-type`);
  if (!lastItem) return;
  animateListRow(lastItem, "in");
}

/** Ставит курсор в последнее поле списка после его добавления. */
function focusLastListItem(itemType, itemIndex, fieldName) {
  const fields = document.querySelectorAll(
    `[onclick*="addListItem('${itemType}',${itemIndex},'${fieldName}')"]`,
  );
  const addButton = fields[0];
  const lastTextarea = addButton?.parentElement?.querySelector(".list-item:last-of-type textarea");
  lastTextarea?.focus();
}

function paneFor(itemType) {
  return byId(itemType === "case" ? "casesPane" : "bugsPane");
}

function updateItemCount(itemType) {
  const counter = byId(itemType === "case" ? "cCount" : "bCount");
  if (counter) counter.textContent = itemsOf(itemType).length;
}

/**
 * После удаления карточки данные следующих элементов сдвигаются на один индекс.
 * Сами DOM-узлы оставляем на месте (особенно <img>), меняем только индексы в
 * id/data/inline-handlers. Так превью не пересоздаются и не мигают.
 */
function reindexItemCard(card, itemType, oldIndex, newIndex) {
  if (oldIndex === newIndex) return;

  card.dataset.itemIndex = String(newIndex);
  const badge = card.querySelector(".card-head .idx");
  if (badge) badge.textContent = String(newIndex + 1);

  const nodes = [card, ...card.querySelectorAll("*")];
  for (const node of nodes) {
    for (const attr of [...node.attributes]) {
      let value = attr.value;
      const updated = value
        .replaceAll(`'${itemType}',${oldIndex},`, `'${itemType}',${newIndex},`)
        .replaceAll(`'${itemType}',${oldIndex})`, `'${itemType}',${newIndex})`)
        .replaceAll(`-${itemType}-${oldIndex}-`, `-${itemType}-${newIndex}-`)
        .replaceAll(`title-${itemType}-${oldIndex}`, `title-${itemType}-${newIndex}`)
        .replaceAll(`status-${itemType}-${oldIndex}`, `status-${itemType}-${newIndex}`);

      if (updated !== value) node.setAttribute(attr.name, updated);
    }

    if (node.dataset?.itemIndex === String(oldIndex)) node.dataset.itemIndex = String(newIndex);
    if (node.dataset?.i === String(oldIndex)) node.dataset.i = String(newIndex);
  }
}

/**
 * Smoothly expands/collapses a whole case or bug card using its measured size.
 * Padding, borders and bottom spacing participate in the animation, so nearby
 * cards move continuously instead of jumping after the fade.
 */
function animateItemCard(card, direction = "in") {
  if (!card || prefersReducedMotion() || typeof card.animate !== "function") {
    return Promise.resolve();
  }

  const styles = getComputedStyle(card);
  const expanded = {
    height: `${card.getBoundingClientRect().height}px`,
    marginBottom: styles.marginBottom,
    paddingTop: styles.paddingTop,
    paddingBottom: styles.paddingBottom,
    borderTopWidth: styles.borderTopWidth,
    borderBottomWidth: styles.borderBottomWidth,
    opacity: 1,
    transform: "translateY(0) scale(.999)",
  };
  const collapsed = {
    height: "0px",
    marginBottom: "0px",
    paddingTop: "0px",
    paddingBottom: "0px",
    borderTopWidth: "0px",
    borderBottomWidth: "0px",
    opacity: 0,
    transform: "translateY(-7px) scale(.992)",
  };
  const entering = direction === "in";

  card.classList.add("motion-running");
  card.style.pointerEvents = entering ? "" : "none";
  const animation = card.animate(
    entering ? [collapsed, expanded] : [expanded, collapsed],
    {
      duration: entering ? 280 : 250,
      easing: entering ? "cubic-bezier(.16, 1, .3, 1)" : "cubic-bezier(.4, 0, .2, 1)",
      fill: "both",
    },
  );

  return animation.finished.catch(() => {}).finally(() => {
    animation.cancel();
    card.classList.remove("motion-running");
    card.style.pointerEvents = "";
  });
}

function addItem(itemType) {
  const list = itemsOf(itemType);
  const item = itemType === "case" ? createTestCase() : createBug();
  const itemIndex = list.length;
  list.push(item);
  clearResumeCandidate();

  const pane = paneFor(itemType);
  const addButton = pane?.querySelector(".add-case");
  pane?.querySelector(".empty-state")?.remove();
  pane?.querySelector(".resume-bar")?.remove();

  if (pane && addButton) {
    addButton.insertAdjacentHTML("beforebegin", renderItemCard(itemType, item, itemIndex));
    const card = pane.querySelector(`.card[data-item-type="${itemType}"][data-item-index="${itemIndex}"]`);
    animateItemCard(card, "in");
  } else {
    // Аварийный fallback оставляем только для реально рассинхронизированного DOM.
    render();
  }

  updateItemCount(itemType);
  refreshDownloadButtons();
  scheduleSave();
}

function removeItem(itemType, itemIndex) {
  const list = itemsOf(itemType);
  const item = list[itemIndex];
  const pane = paneFor(itemType);
  const target = pane?.querySelector(`.card[data-item-type="${itemType}"][data-item-index="${itemIndex}"]`);

  if (!pane || !target || !item) {
    if (itemIndex >= 0 && itemIndex < list.length) list.splice(itemIndex, 1);
    render();
    scheduleSave();
    return;
  }

  animateItemCard(target, "out").then(() => {
    // Find by object reference: another card may have completed its own short
    // removal animation first and shifted numeric indexes in the meantime.
    const currentIndex = list.indexOf(item);
    if (currentIndex < 0) return;

    list.splice(currentIndex, 1);
    target.remove();

    // Не перерисовываем оставшиеся карточки: только перенумеровываем их ссылки на state.
    const following = [...pane.querySelectorAll(`.card[data-item-type="${itemType}"]`)]
      .filter((card) => Number(card.dataset.itemIndex) > currentIndex)
      .sort((a, b) => Number(a.dataset.itemIndex) - Number(b.dataset.itemIndex));

    following.forEach((card) => {
      const oldIndex = Number(card.dataset.itemIndex);
      reindexItemCard(card, itemType, oldIndex, oldIndex - 1);
    });

    if (!list.length) {
      const addButton = pane.querySelector(".add-case");
      addButton?.insertAdjacentHTML("beforebegin", renderEmptyState(itemType));
    }

    updateItemCount(itemType);
    refreshDownloadButtons();
    scheduleSave();
  });
}

// ─── восстановление прошлой работы ───

async function resumeLastDraft() {
  const candidate = getResumeCandidate();
  if (!candidate) return;

  clearResumeCandidate();
  await openDraft(candidate._id);
}

function dismissResumeBar() {
  clearResumeCandidate();
  render();
}

/**
 * Разметка карточек собирается строками, поэтому обработчики в атрибутах
 * ищут функции в глобальной области. Публикуем только то, что там нужно.
 */
function exposeInlineHandlers() {
  // часть обработчиков вызывается только из onclick в строках разметки —
  // анализатор их не видит и считает неиспользуемыми
  // noinspection JSUnusedGlobalSymbols
  Object.assign(window, {
    updateField,
    toggleStatusDropdown,
    chooseStatus,
    addItem,
    removeItem,
    pickImageFile,
    removeImage,
    editCaption,
    clearFieldError,
    openDraft,
    renameDraft,
    deleteDraft,
    toggleDraftMenu,
    resumeLastDraft,
    dismissResumeBar,
    updateListItem,
    addListItem,
    removeListItem,
  });
}

// ─── обработчики интерфейса ───

const ACTIVE_TAB_STORAGE_KEY = "activeTab";

/** Показывает нужную вкладку и запоминает выбор до конца сессии. */
function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  const isCasesTab = tabName === "cases";
  byId("casesPane").style.display = isCasesTab ? "" : "none";
  byId("bugsPane").style.display = isCasesTab ? "none" : "";

  sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabName);

  // панель рисовалась скрытой, а у скрытой scrollHeight = 0 —
  // высоту textarea можно посчитать только сейчас, когда она видима
  autoGrowAllTextareas();
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      activateTab(tab.dataset.tab);
      window.scrollTo(0, 0);
    };
  });
}

function initHeaderFields() {
  const fieldToProperty = { project: "project", date: "date", jira: "jira_base" };

  Object.entries(fieldToProperty).forEach(([elementId, property]) => {
    byId(elementId).oninput = (event) => {
      currentDraft[property] = event.target.value;
      scheduleSave();
    };
  });

  byId("draftName").onclick = () => renameCurrentDraft(saveNow);
}

function initSidebar() {
  byId("burger").onclick = () => {
    const isOpen = byId("sidebar").classList.contains("open");
    if (isOpen) closeSidebar(); else openSidebar();
  };
  byId("backdrop").onclick = closeSidebar;
  byId("newDraftBtn").onclick = startNewDraft;
}

function initAutoGrow() {
  document.addEventListener("input", (event) => {
    if (event.target?.tagName === "TEXTAREA") autoGrowTextarea(event.target);
  });
}

const SCROLL_STORAGE_KEY = "report_app_scroll";

/** Запоминает позицию прокрутки перед уходом со страницы. */
function initScrollMemory() {
  // браузер восстанавливает прокрутку сам, но к тому моменту страница ещё пуста —
  // забираем это на себя, чтобы он не мешал
  history.scrollRestoration = "manual";

  window.addEventListener("beforeunload", () => {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
  });
}

/** Возвращает прокрутку туда, где она была до перезагрузки. */
function restoreScroll() {
  const saved = Number(sessionStorage.getItem(SCROLL_STORAGE_KEY));
  if (!saved) return;

  // textarea растягиваются в render(), высота страницы меняется —
  // прокручиваем следующим кадром, когда раскладка уже посчитана
  requestAnimationFrame(() => window.scrollTo(0, saved));
}

/**
 * Готовит начальное состояние.
 *
 * Перезагрузка вкладки возвращает открытый черновик — но только если его
 * действительно открывали. Иначе остаётся чистый лист и предложение продолжить.
 */
async function restoreInitialDraft() {
  const openDraftId = getOpenDraftId();

  if (openDraftId) {
    try {
      setCurrentDraft(await api.fetchDraft(openDraftId));
      cleanupEmptyListItems(currentDraft);
      return;
    } catch (error) {
      forgetOpenDraft();
    }
  }

  // ничего не открывали — предлагаем вернуться к прошлому черновику, если он непустой
  const lastDraftId = localStorage.getItem(LAST_DRAFT_STORAGE_KEY);
  if (lastDraftId) {
    try {
      const draft = await api.fetchDraft(lastDraftId);
      const hasContent = (draft.cases || []).length || (draft.bugs || []).length;
      if (hasContent) setResumeCandidate(draft);
    } catch (error) {
      localStorage.removeItem(LAST_DRAFT_STORAGE_KEY);
    }
  }

  const blank = await api.fetchEmptyDraft();
  setCurrentDraft(blank);
  currentDraft._id = null;
  currentDraft._title = null;
}

async function init() {
  exposeInlineHandlers();
  initTabs();
  initHeaderFields();
  initProjectDropdown();
  initDialogs();
  initSidebar();
  initAutoGrow();
  initStatusDropdowns();
  initScrollMemory();
  initDragAndDrop();
  initPasteImages();
  initDownloadButtons();

  onAfterRender(refreshDownloadButtons);
  onDraftSaved(refreshDraftList);

  await restoreInitialDraft();

  // вкладку восстанавливаем до render(): autoGrow не умеет считать высоту
  // у скрытой панели, поэтому нужная вкладка должна быть уже видима
  activateTab(sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || "cases");

  syncHeader();
  render();
  restoreScroll();
  await refreshDraftList();
}

void init();
