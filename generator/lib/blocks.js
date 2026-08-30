// Кирпичики, из которых собирается документ: абзацы, заголовки полей,
// нумерованные списки, картинки. Ничего не знают о структуре отчёта.

const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");
const {
  Paragraph,
  TextRun,
  ImageRun,
  ExternalHyperlink,
  BorderStyle,
  PageBreak,
  AlignmentType,
} = require("docx");

const {
  FONT_FAMILY,
  BASE_FONT_SIZE,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_HEIGHT,
  LIST_INDENT_LEFT,
  LIST_INDENT_HANGING,
  PLAIN_INDENT_LEFT,
  SPACING,
  STATUS_COLORS,
  COLORS,
  EMPTY_FIELD_PLACEHOLDER,
} = require("./styles");

/** Кусочек текста с общими настройками шрифта. */
function textRun(content, options = {}) {
  const props = {
    font: FONT_FAMILY,
    size: options.size || BASE_FONT_SIZE,
    bold: Boolean(options.bold),
    color: options.color,
  };

  const lines = String(content ?? "").split("\n");
  if (lines.length === 1) return new TextRun({ text: lines[0], ...props });

  // Enter внутри пункта — мягкий перенос (Shift+Enter в Word), номер не меняется.
  // Word не видит \n, поэтому каждая следующая строка — свой ран с разрывом перед ним.
  return lines.map((line, index) => new TextRun({
    text: line,
    ...(index > 0 && { break: 1 }),
    ...props,
  }));
}

/** Явная гиперссылка с теми же параметрами шрифта, что и окружающий текст. */
function externalLink(displayText, url, options = {}) {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text: displayText,
        font: FONT_FAMILY,
        size: options.size || BASE_FONT_SIZE,
        bold: Boolean(options.bold),
        color: COLORS.link,
        underline: {},
      }),
    ],
  });
}

/** Отделяет от URL завершающие знаки обычного предложения. */
function splitUrlPunctuation(value) {
  let url = value;
  let trailing = "";

  while (/[.,;!?]$/.test(url)) {
    trailing = url.at(-1) + trailing;
    url = url.slice(0, -1);
  }

  [["(", ")"], ["[", "]"], ["{", "}"]].forEach(([opening, closing]) => {
    const openingCount = [...url].filter((char) => char === opening).length;
    let closingCount = [...url].filter((char) => char === closing).length;
    while (url.endsWith(closing) && closingCount > openingCount) {
      trailing = closing + trailing;
      url = url.slice(0, -1);
      closingCount -= 1;
    }
  });

  return { url, trailing };
}

/** Превращает http/https внутри обычного текста в синие подчёркнутые ссылки. */
function linkedTextRuns(content, options = {}) {
  const value = String(content ?? "");
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const children = [];
  let cursor = 0;

  value.replace(urlPattern, (matchedUrl, offset) => {
    if (offset > cursor) children.push(textRun(value.slice(cursor, offset), options));

    const { url, trailing } = splitUrlPunctuation(matchedUrl);
    if (url) children.push(externalLink(url, url, options));
    if (trailing) children.push(textRun(trailing, options));
    cursor = offset + matchedUrl.length;
    return matchedUrl;
  });

  if (cursor < value.length) children.push(textRun(value.slice(cursor), options));
  if (!children.length) children.push(textRun(value, options));
  return children;
}

/** Дети абзаца одним плоским списком: textRun при переносах возвращает несколько ранов. */
const toChildren = (children) => [children].flat(Infinity);

/** Абзац. Интервалы before/after передаются плоско и раскладываются в spacing. */
function paragraph(children, options = {}) {
  const { after, before, ...rest } = options;
  const spacing = { after: after ?? SPACING.afterParagraph };
  if (before != null) spacing.before = before;

  return new Paragraph({
    children: toChildren(children),
    spacing,
    ...rest,
  });
}

/** Заголовок поля: «Предусловие:», «Шаги:» и подобные. */
function fieldLabel(title) {
  return paragraph([textRun(title, { bold: true })], { after: SPACING.afterLabel });
}

/** Пустой абзац — визуальный отступ между блоками. */
function emptyLine() {
  return paragraph([textRun("")], { after: 0 });
}

/** Разрыв страницы. */
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

/** Горизонтальная линия-разделитель. */
function divider() {
  return new Paragraph({
    spacing: { after: 240, before: 120 },
    border: {
      bottom: { color: COLORS.divider, style: BorderStyle.SINGLE, size: 6, space: 1 },
    },
    children: [],
  });
}

/**
 * Счётчики нумерованных списков.
 *
 * В документе у каждого поля свой счётчик, поэтому нумерация в каждом блоке
 * начинается с единицы, а не продолжается сквозь весь отчёт. Ссылки копятся
 * здесь и регистрируются при создании документа.
 */
class NumberingRegistry {
  constructor() {
    this.references = [];
  }

  /** Создаёт новый независимый счётчик. */
  createReference() {
    const reference = `field-list-${this.references.length}`;
    this.references.push(reference);
    return reference;
  }

  /** Конфигурация для конструктора Document. */
  toConfig() {
    return this.references.map((reference) => ({
      reference,
      levels: [{
        level: 0,
        format: "decimal",
        text: "%1.",
        alignment: "start",
        style: {
          paragraph: {
            indent: { left: LIST_INDENT_LEFT, hanging: LIST_INDENT_HANGING },
          },
        },
      }],
    }));
  }
}

/** Пункт нумерованного списка. Пункты с одной ссылкой нумеруются подряд. */
function numberedParagraph(children, reference, options = {}) {
  return new Paragraph({
    children: toChildren(children),
    numbering: { reference, level: 0 },
    indent: { left: LIST_INDENT_LEFT, hanging: LIST_INDENT_HANGING },
    spacing: { after: options.after ?? SPACING.afterParagraph },
  });
}

/** Абзац с отступом на уровне номеров, но без самого номера. */
function indentedParagraph(children, options = {}) {
  return new Paragraph({
    children: toChildren(children),
    indent: { left: PLAIN_INDENT_LEFT },
    spacing: { after: options.after ?? SPACING.afterParagraph },
  });
}

/** Прочерк для незаполненного поля. */
function placeholderParagraph() {
  return paragraph([textRun(EMPTY_FIELD_PLACEHOLDER, { color: COLORS.placeholder })], {
    indent: { left: PLAIN_INDENT_LEFT, firstLine: 0 },
    after: SPACING.afterParagraph,
  });
}

/** Строка статуса, окрашенная по значению. */
function statusParagraph(status) {
  return paragraph(
    [
      textRun("Статус: ", { bold: true }),
      textRun(status, { bold: true, color: STATUS_COLORS[status] || "000000" }),
    ],
    { after: SPACING.afterStatus },
  );
}

/** Ссылка на задачу: отображаемый текст и целевой URL. */
function taskLink(displayText, url) {
  return externalLink(displayText, url);
}

/**
 * Картинка с подписью. Возвращает массив абзацев.
 *
 * Первая картинка блока получает больший отступ сверху, чтобы отделиться
 * от заголовка поля. Если файла нет — вместо картинки появится пометка.
 */
function imageBlock(imagesDir, filename, caption, isFirstInBlock) {
  const fullPath = path.join(imagesDir, filename);

  if (!fs.existsSync(fullPath)) {
    return [paragraph([textRun(`⚠ картинка не найдена: ${filename}`, { color: COLORS.error })])];
  }

  // Uint8Array, а не Buffer: image-size и docx объявлены именно на нём
  const content = new Uint8Array(fs.readFileSync(fullPath));
  const dimensions = imageSize(content);
  const scale = Math.min(
    1,
    MAX_IMAGE_WIDTH / dimensions.width,
    MAX_IMAGE_HEIGHT / dimensions.height,
  );
  const renderedWidth = Math.round(dimensions.width * scale);
  const renderedHeight = Math.round(dimensions.height * scale);
  const extension = path.extname(filename).slice(1).toLowerCase();

  const blocks = [
    paragraph(
      // тип картинки здесь обычная строка, docx ждёт перечисление — на выполнение не влияет
      // noinspection JSCheckFunctionSignatures
      [new ImageRun({
        data: content,
        type: extension === "jpg" ? "jpg" : extension,
        transformation: {
          width: renderedWidth,
          height: renderedHeight,
        },
      })],
      {
        after: caption ? SPACING.afterImage : SPACING.afterImageWithoutCaption,
        before: isFirstInBlock ? SPACING.beforeFirstImage : SPACING.beforeNextImage,
        alignment: AlignmentType.CENTER,
        // Подпись не должна отрываться от картинки на следующую страницу.
        keepNext: Boolean(caption),
      },
    ),
  ];

  if (caption) {
    blocks.push(paragraph(linkedTextRuns(caption, { size: 18, color: COLORS.caption }), {
      after: SPACING.afterCaption,
      alignment: AlignmentType.CENTER,
    }));
  }

  return blocks;
}

module.exports = {
  textRun,
  linkedTextRuns,
  paragraph,
  fieldLabel,
  emptyLine,
  pageBreak,
  divider,
  NumberingRegistry,
  numberedParagraph,
  indentedParagraph,
  placeholderParagraph,
  statusParagraph,
  taskLink,
  imageBlock,
};
