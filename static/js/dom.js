// Мелкие утилиты для работы с разметкой.

/** Короткая замена document.getElementById. */
export const byId = (id) => document.getElementById(id);

/** Экранирует текст перед вставкой в HTML. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Ищет ближайший подходящий элемент от точки события.
 * Цель drop-события может оказаться текстовым узлом — у него нет closest,
 * поэтому поднимаемся к родителю.
 */
export function closestElement(node, selector) {
  let element = node;
  if (element && element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }
  if (!element || !element.closest) return null;
  return element.closest(selector);
}

/** Подгоняет высоту текстового поля под содержимое. */
export function autoGrowTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

/** Включает авторастягивание для всех полей ввода на странице. */
export function autoGrowAllTextareas() {
  document.querySelectorAll(".row textarea, .list-item textarea").forEach(autoGrowTextarea);
}

/** Правильное окончание существительного при числе. */
export function pluralize(count, one, few, many) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
