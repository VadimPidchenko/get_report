// Оформление документа: шрифт, цвета, отступы.
// Значения подобраны по эталонному отчёту — менять их стоит осознанно.

const FONT_FAMILY = "Arial";
const BASE_FONT_SIZE = 22; // половины пункта, то есть 11pt

// Максимальная ширина картинки в документе. Учитывает отступ слева:
// при большем значении широкие скриншоты вылезут за поле страницы.
const MAX_IMAGE_WIDTH = 500;

// Отступы нумерованного текста внутри поля
const LIST_INDENT_LEFT = 720; // сдвиг всего абзаца
const LIST_INDENT_HANGING = 360; // номер выносится левее текста
const PLAIN_INDENT_LEFT = LIST_INDENT_LEFT - LIST_INDENT_HANGING; // абзацы без номера: описание, прочерк

// Вертикальные интервалы
const SPACING = {
  afterLabel: 80, // под заголовком поля
  afterParagraph: 120, // под обычным абзацем
  afterImage: 40, // под картинкой
  beforeFirstImage: 200, // между заголовком и первой картинкой
  beforeNextImage: 60, // между соседними картинками
  afterStatus: 240, // под строкой статуса
  afterCaption: 160, // под подписью к картинке
};

const STATUS_COLORS = {
  Passed: "2E7D32",
  Failed: "C62828",
  Blocked: "EF6C00",
  Skipped: "757575",
  Done: "2E7D32",
  "In Progress": "EF6C00",
  "To Do": "757575",
  Backlog: "757575",
};

const COLORS = {
  placeholder: "9AA3AD", // прочерк пустого поля
  caption: "757575", // подпись под картинкой
  link: "1155CC",
  subtitle: "555555",
  divider: "D0D0D0",
  error: "C62828",
};

const EMPTY_FIELD_PLACEHOLDER = "—";

// Поля страницы
const PAGE_MARGIN = { top: 1000, bottom: 1000, left: 1100, right: 1100 };

module.exports = {
  FONT_FAMILY,
  BASE_FONT_SIZE,
  MAX_IMAGE_WIDTH,
  LIST_INDENT_LEFT,
  LIST_INDENT_HANGING,
  PLAIN_INDENT_LEFT,
  SPACING,
  STATUS_COLORS,
  COLORS,
  EMPTY_FIELD_PLACEHOLDER,
  PAGE_MARGIN,
};
