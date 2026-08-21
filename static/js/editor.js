// Операции редактирования содержимого текущего черновика.

import { byId } from "./dom.js";
import { itemsOf, createTestCase, createBug } from "./state.js";
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

export function updateListItem(itemType, itemIndex, fieldName, pointIndex, value) {
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

export function addListItem(itemType, itemIndex, fieldName) {
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

export function removeListItem(itemType, itemIndex, fieldName, pointIndex) {
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

export function addItem(itemType) {
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

export function removeItem(itemType, itemIndex) {
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
