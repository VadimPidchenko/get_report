// Операции редактирования содержимого текущего черновика.

import { byId, autoGrowTextarea } from "./dom.js";
import { currentDraft, itemsOf, createTestCase, createBug } from "./state.js";
import { scheduleSave } from "./draft-persistence.js";
import {
  render,
  clearResumeCandidate,
  renderListField,
  renderItemCard,
  renderEmptyState,
} from "./render.js";
import { refreshDownloadButtons } from "./reports.js";

export function updateField(itemType, itemIndex, fieldName, value) {
  itemsOf(itemType)[itemIndex][fieldName] = value;
  scheduleSave();
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
  const wasInvalid = field.classList.contains("invalid");
  field.outerHTML = renderListField(
    itemsOf(itemType)[itemIndex][fieldName],
    itemType,
    itemIndex,
    fieldName,
    addLabel,
  );

  if (wasInvalid) {
    const replacement = document.querySelector(selector);
    replacement?.classList.add("invalid");
    replacement?.setAttribute("aria-invalid", "true");
  }
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
  const selector = `.list-field[data-item-type="${itemType}"][data-item-index="${itemIndex}"][data-field-name="${fieldName}"]`;
  const lastTextarea = document.querySelector(`${selector} .list-item:last-of-type textarea`);
  lastTextarea?.focus();
}

function paneFor(itemType) {
  return byId(itemType === "case" ? "casesPane" : "bugsPane");
}

function updateItemCount(itemType) {
  const counter = byId(itemType === "case" ? "cCount" : "bCount");
  if (counter) counter.textContent = itemsOf(itemType).length;
}

/** Закрывает все меню карточек, кроме переданного. */
export function closeItemMenus(except = null) {
  document.querySelectorAll(".item-menu.open").forEach((menu) => {
    if (menu === except) return;
    menu.classList.remove("open");
    const card = menu.closest(".card");
    card?.classList.remove("menu-open");
    card?.querySelector(".item-menu-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function toggleItemMenu(trigger) {
  const card = trigger.closest(".card");
  const menu = card?.querySelector(".item-menu");
  if (!menu) return;

  const willOpen = !menu.classList.contains("open");
  if (willOpen) document.dispatchEvent(new Event("app:close-competing-menus"));
  closeItemMenus(menu);
  menu.classList.toggle("open", willOpen);
  card.classList.toggle("menu-open", willOpen);
  trigger.setAttribute("aria-expanded", String(willOpen));
}

/**
 * После удаления карточки данные следующих элементов сдвигаются на один индекс.
 * Сами DOM-узлы оставляем на месте (особенно <img>), меняем только индексы в
 * id/data. Так превью не пересоздаются и не мигают.
 */
function reindexItemCard(card, itemType, oldIndex, newIndex) {
  if (oldIndex === newIndex) return;

  card.dataset.itemIndex = String(newIndex);
  const badge = card.querySelector(".card-head .idx");
  if (badge) badge.textContent = String(newIndex + 1);

  const title = card.querySelector(`#title-${itemType}-${oldIndex}`);
  if (title) title.id = `title-${itemType}-${newIndex}`;
  const titleHint = card.querySelector(
    `.req-hint[data-error-for="title-${itemType}-${oldIndex}"]`,
  );
  if (titleHint) titleHint.dataset.errorFor = `title-${itemType}-${newIndex}`;

  const expectedHint = card.querySelector(
    `.req-hint[data-error-for="expected-${itemType}-${oldIndex}"]`,
  );
  if (expectedHint) expectedHint.dataset.errorFor = `expected-${itemType}-${newIndex}`;

  const status = card.querySelector(`#status-${itemType}-${oldIndex}`);
  if (status) status.id = `status-${itemType}-${newIndex}`;

  card.querySelectorAll(".list-field").forEach((field) => {
    field.dataset.itemIndex = String(newIndex);
  });

  card.querySelectorAll(".dropzone").forEach((dropzone) => {
    dropzone.dataset.i = String(newIndex);
    dropzone.id = `dz-${itemType}-${newIndex}-${dropzone.dataset.field}`;
  });
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

const COPY_SUFFIX_PATTERN = /\s+\(копия(?:\s+\d+)?\)$/i;

/** Подбирает понятное и уникальное название копии в текущем списке. */
function copyTitle(itemType, sourceTitle) {
  const value = String(sourceTitle || "").trim();
  if (!value) return "";

  const fieldName = itemType === "case" ? "name" : "title";
  const base = value.replace(COPY_SUFFIX_PATTERN, "").trim();
  const used = new Set(
    itemsOf(itemType).map((item) => String(item[fieldName] || "").trim().toLocaleLowerCase("ru")),
  );

  let candidate = `${base} (копия)`;
  let copyNumber = 2;
  while (used.has(candidate.toLocaleLowerCase("ru"))) {
    candidate = `${base} (копия ${copyNumber})`;
    copyNumber += 1;
  }
  return candidate;
}

/** Показывает новую карточку и переводит пользователя к редактированию названия. */
function revealDuplicatedCard(card) {
  if (!card) return;

  card.querySelectorAll("textarea").forEach((textarea) => autoGrowTextarea(textarea));
  animateItemCard(card, "in").then(() => {
    card.classList.add("just-duplicated");
    setTimeout(() => card.classList.remove("just-duplicated"), 1600);

    const title = card.querySelector("input.title");
    title?.focus({ preventScroll: true });
    card.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  });
}

/** Дублирует кейс или баг и вставляет независимую копию сразу после оригинала. */
function duplicateItem(itemType, itemIndex) {
  const list = itemsOf(itemType);
  const source = list[itemIndex];
  if (!source) return;

  // Данные черновика JSON-совместимы. Глубокая копия разделяет вложенные списки
  // и подписи картинок, а сами неизменяемые файлы безопасно переиспользуются.
  const copy = JSON.parse(JSON.stringify(source));
  const titleField = itemType === "case" ? "name" : "title";
  copy[titleField] = copyTitle(itemType, source[titleField]);

  const insertIndex = itemIndex + 1;
  list.splice(insertIndex, 0, copy);

  const pane = paneFor(itemType);
  const sourceCard = pane?.querySelector(
    `.card[data-item-type="${itemType}"][data-item-index="${itemIndex}"]`,
  );

  if (!pane || !sourceCard) {
    render();
    revealDuplicatedCard(
      paneFor(itemType)?.querySelector(
        `.card[data-item-type="${itemType}"][data-item-index="${insertIndex}"]`,
      ),
    );
  } else {
    // Сдвигаем DOM-индексы с конца, чтобы временно не создавать одинаковые id.
    const following = [...pane.querySelectorAll(`.card[data-item-type="${itemType}"]`)]
      .filter((card) => Number(card.dataset.itemIndex) > itemIndex)
      .sort((a, b) => Number(b.dataset.itemIndex) - Number(a.dataset.itemIndex));

    following.forEach((card) => {
      const oldIndex = Number(card.dataset.itemIndex);
      reindexItemCard(card, itemType, oldIndex, oldIndex + 1);
    });

    sourceCard.insertAdjacentHTML("afterend", renderItemCard(itemType, copy, insertIndex));
    revealDuplicatedCard(
      pane.querySelector(`.card[data-item-type="${itemType}"][data-item-index="${insertIndex}"]`),
    );
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

const headerFieldToProperty = { project: "project", date: "date", jira: "jira_base" };

function handleEditorInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.tagName === "TEXTAREA") autoGrowTextarea(target);

  const headerProperty = headerFieldToProperty[target.id];
  if (headerProperty) {
    currentDraft[headerProperty] = target.value;
    scheduleSave();
    return;
  }

  const card = target.closest(".card[data-item-type][data-item-index]");
  if (!card) return;

  const itemType = card.dataset.itemType;
  const itemIndex = Number(card.dataset.itemIndex);
  const listField = target.closest(".list-field[data-field-name]");
  const listItem = target.closest(".list-item[data-point-index]");

  if (listField && listItem && target.matches("textarea")) {
    updateListItem(
      itemType,
      itemIndex,
      listField.dataset.fieldName,
      Number(listItem.dataset.pointIndex),
      target.value,
    );
    return;
  }

  if (target.matches("[data-field-name]")) {
    updateField(itemType, itemIndex, target.dataset.fieldName, target.value);
  }
}

function handleEditorClick(event) {
  const actionTarget = event.target.closest?.("[data-action]");
  if (!actionTarget) return;

  if (actionTarget.dataset.action === "add-item") {
    addItem(actionTarget.dataset.itemType);
    return;
  }

  const card = actionTarget.closest(".card[data-item-type][data-item-index]");
  if (!card) return;

  const itemType = card.dataset.itemType;
  const itemIndex = Number(card.dataset.itemIndex);

  if (actionTarget.dataset.action === "toggle-item-menu") {
    event.stopPropagation();
    toggleItemMenu(actionTarget);
    return;
  }

  if (actionTarget.dataset.action === "duplicate-item") {
    closeItemMenus();
    duplicateItem(itemType, itemIndex);
    return;
  }

  if (actionTarget.dataset.action === "remove-item") {
    closeItemMenus();
    removeItem(itemType, itemIndex);
    return;
  }

  const listField = actionTarget.closest(".list-field[data-field-name]");
  if (!listField) return;

  if (actionTarget.dataset.action === "add-list-item") {
    addListItem(itemType, itemIndex, listField.dataset.fieldName);
  } else if (actionTarget.dataset.action === "remove-list-item") {
    const listItem = actionTarget.closest(".list-item[data-point-index]");
    if (listItem) {
      removeListItem(
        itemType,
        itemIndex,
        listField.dataset.fieldName,
        Number(listItem.dataset.pointIndex),
      );
    }
  }
}

/** Подключает единые обработчики ко всем текущим и будущим карточкам редактора. */
export function initEditorEvents() {
  document.addEventListener("input", handleEditorInput);
  document.addEventListener("click", () => closeItemMenus());
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openMenu = document.querySelector(".item-menu.open");
    if (!openMenu) return;
    const trigger = openMenu.closest(".card")?.querySelector(".item-menu-trigger");
    closeItemMenus();
    trigger?.focus();
  });
  window.addEventListener("resize", () => closeItemMenus(), { passive: true });
  [byId("casesPane"), byId("bugsPane")].forEach((pane) => {
    pane.addEventListener("click", handleEditorClick);
  });
}
