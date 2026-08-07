// Как черновик представляется в интерфейсе: метка проекта и дата отчёта.
//
// Одни и те же сведения показывают карточка в боковой панели и плашка
// восстановления в контенте, поэтому правила лежат здесь, а не в одной из них.

/** Короткие метки проектов для карточки: место в углу тесное. */
const PROJECT_BADGES = {
  "a7.ru": { label: "A7.RU", kind: "a7" },
  "finmart": { label: "finmart", kind: "finmart" },
};

/**
 * Метка проекта.
 *
 * Пока проект не выбран, отчёт не собрать: проверка перед сборкой не пустит.
 * Поэтому пустое поле и значит «черновик» — отдельный флаг не нужен.
 */
export function draftBadge(project) {
  if (!project) return { label: "draft", kind: "draft" };

  // проект не из списка — показываем как есть, обрезав до ширины метки
  return PROJECT_BADGES[project] || { label: project.slice(0, 4), kind: "other" };
}

/** Сегодняшний день с обнулённым временем — точка отсчёта для «Сегодня» и «Вчера». */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Дата отчёта словами. В боковой панели она же служит заголовком и ключом
 * группы, поэтому «1.07.2026» и «01.07.2026» дают одинаковый ответ.
 *
 * Поле «Дата» — обычный ввод, туда можно вписать что угодно или стереть:
 * всё, что не разобралось, считается отчётом без даты.
 */
export function formatDay(reportDate) {
  const parts = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(reportDate ?? "").trim());
  if (!parts) return "Без даты";

  const [, day, month, year] = parts;
  const value = new Date(Number(year), Number(month) - 1, Number(day));

  // подставленные числа могли не сойтись с календарём: 31.02 превращается в март
  if (value.getMonth() !== Number(month) - 1) return "Без даты";

  // считаем в календарных днях, а не в миллисекундах: перевод часов не помешает
  const distance = Math.round((startOfToday() - value) / DAY_MS);
  if (distance === 0) return "Сегодня";
  if (distance === 1) return "Вчера";

  return value.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
