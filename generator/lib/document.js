// Структура отчёта: шапка, тест-кейсы, баг-репорты.
// Использует кирпичики из blocks.js и ничего не знает о файловой системе.

const { Document } = require("docx");

const {
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
} = require("./blocks");

const {
  FONT_FAMILY,
  BASE_FONT_SIZE,
  SPACING,
  STATUS_COLORS,
  COLORS,
  EMPTY_FIELD_PLACEHOLDER,
  PAGE_MARGIN,
} = require("./styles");

/**
 * Заголовок поля и его пункты.
 * Каждый непустой пункт — строка нумерованного списка. Если пунктов нет,
 * ставится прочерк, чтобы структура кейсов оставалась одинаковой.
 */
function appendField(blocks, title, values, numbering) {
  blocks.push(fieldLabel(title));

  const filled = (values || []).map((v) => String(v).trim()).filter(Boolean);
  if (!filled.length) {
    blocks.push(placeholderParagraph());
    return;
  }

  const reference = numbering.createReference();
  filled.forEach((value) => {
    blocks.push(numberedParagraph(linkedTextRuns(value), reference));
  });
}

/**
 * Блок «Задачи» со ссылками на трекер.
 * Если пункт начинается с http:// или https:// — это готовая ссылка,
 * берём как есть. Иначе считаем номером задачи и клеим базовый URL.
 */
function appendTasks(blocks, tasks, jiraBaseUrl, numbering) {
  const filled = (tasks || []).map((t) => String(t).trim()).filter(Boolean);
  if (!filled.length) return;

  blocks.push(paragraph([textRun("Задачи:", { bold: true })], {
    after: SPACING.afterParagraph,
  }));

  const reference = numbering.createReference();
  filled.forEach((task) => {
    // noinspection HttpUrlsUsage
    const isFullUrl = task.startsWith("http://") || task.startsWith("https://");
    const url = isFullUrl ? task : jiraBaseUrl + task;
    blocks.push(numberedParagraph([taskLink(task, url)], reference, {
      after: SPACING.afterParagraph,
    }));
  });
}

/**
 * Блок «Результат тестирования».
 *
 * Особое правило: сюда часто кладут только картинки без текста, поэтому
 * прочерк ставится, лишь когда нет ни текста, ни изображений.
 */
function appendTestResult(blocks, testCase, imagesDir, numbering) {
  blocks.push(fieldLabel("Результат тестирования:"));

  const filled = (testCase.result || []).map((v) => String(v).trim()).filter(Boolean);
  const images = testCase.result_images || [];

  if (filled.length) {
    const reference = numbering.createReference();
    filled.forEach((value) => {
      blocks.push(numberedParagraph(linkedTextRuns(value), reference));
    });
  }

  images.forEach((image, index) => {
    blocks.push(...imageBlock(imagesDir, image.file, image.caption, index === 0));
  });

  if (!filled.length && images.length === 0) {
    blocks.push(placeholderParagraph());
  }
}

/** Один тест-кейс целиком. */
function buildTestCase(testCase, options) {
  const { index, jiraBaseUrl, imagesDir, numbering, isLast } = options;
  const blocks = [];

  blocks.push(paragraph(
    linkedTextRuns(`${index}. ${testCase.name || EMPTY_FIELD_PLACEHOLDER}`, { bold: true, size: 26 }),
    { after: SPACING.afterParagraph },
  ));

  appendTasks(blocks, testCase.tasks, jiraBaseUrl, numbering);
  appendField(blocks, "Предусловие:", testCase.precondition, numbering);
  appendField(blocks, "Шаги:", testCase.steps, numbering);

  appendField(blocks, "Ожидаемый результат:", testCase.expected, numbering);
  (testCase.expected_images || []).forEach((image, imageIndex) => {
    blocks.push(...imageBlock(imagesDir, image.file, image.caption, imageIndex === 0));
  });

  blocks.push(emptyLine());
  appendTestResult(blocks, testCase, imagesDir, numbering);

  blocks.push(emptyLine());
  blocks.push(statusParagraph(testCase.status));

  // каждый кейс занимает отдельную страницу — так отчёт не приходится править руками
  if (!isLast) blocks.push(pageBreak());

  return blocks;
}

/** Раздел с баг-репортами. */
function buildBugSection(bugs, options) {
  if (!bugs || !bugs.length) return [];

  const { jiraBaseUrl, imagesDir, numbering } = options;
  const blocks = [paragraph([textRun("Баг-репорты", { bold: true, size: 30 })], {
    after: 200,
    before: 240,
  })];

  bugs.forEach((bug, index) => {
    blocks.push(paragraph(linkedTextRuns(`${index + 1}. ${bug.title}`, { bold: true, size: 24 }), {
      after: SPACING.afterLabel,
      ...(index > 0 && { before: SPACING.beforeBugReport }),
    }));

    appendTasks(blocks, bug.tasks, jiraBaseUrl, numbering);

    if (bug.desc) {
      blocks.push(fieldLabel("Описание:"));
      blocks.push(indentedParagraph(linkedTextRuns(bug.desc.trim())));
    }

    blocks.push(statusParagraph(bug.status));

    (bug.images || []).forEach((image, imageIndex) => {
      blocks.push(...imageBlock(imagesDir, image.file, image.caption, imageIndex === 0));
    });
  });

  return blocks;
}

/** Шапка отчёта: название, дата, сводка по статусам. */
function buildHeader(report) {
  const cases = report.cases || [];
  const passed = cases.filter((item) => item.status === "Passed").length;
  const failed = cases.filter((item) => item.status === "Failed").length;
  const bugCount = (report.bugs || []).length;

  return [
    paragraph([textRun(`Отчёт о тестировании ${report.project || ""}`, { bold: true, size: 36 })], {
      after: SPACING.afterLabel,
    }),
    paragraph([textRun(`Дата: ${report.date || ""}`, { color: COLORS.subtitle })], {
      after: SPACING.afterLabel,
    }),
    paragraph([
      textRun("Итог: ", { bold: true }),
      textRun(`${cases.length} кейсов  ·  `),
      textRun(`${passed} Passed`, { color: STATUS_COLORS.Passed, bold: true }),
      textRun("  ·  "),
      textRun(`${failed} Failed`, { color: STATUS_COLORS.Failed, bold: true }),
      textRun(`  ·  ${bugCount} багов`),
    ], { after: 60 }),
    divider(),
  ];
}

/** Собирает документ целиком и возвращает готовый Document. */
function buildDocument(report, imagesDir) {
  const numbering = new NumberingRegistry();
  const jiraBaseUrl = report.jira_base || "";
  const cases = report.cases || [];
  const bugs = report.bugs || [];
  const hasBugs = bugs.length > 0;

  const body = [...buildHeader(report)];

  body.push(paragraph([textRun("Тест-кейсы", { bold: true, size: 30 })], { after: 200 }));
  cases.forEach((testCase, index) => {
    body.push(...buildTestCase(testCase, {
      index: index + 1,
      jiraBaseUrl,
      imagesDir,
      numbering,
      // разрыв не нужен только у последнего блока документа
      isLast: index === cases.length - 1 && !hasBugs,
    }));
  });

  body.push(...buildBugSection(bugs, { jiraBaseUrl, imagesDir, numbering }));

  return new Document({
    styles: { default: { document: { run: { font: FONT_FAMILY, size: BASE_FONT_SIZE } } } },
    // счётчики регистрируются после сборки тела — к этому моменту все ссылки созданы
    numbering: { config: numbering.toConfig() },
    sections: [{ properties: { page: { margin: PAGE_MARGIN } }, children: body }],
  });
}

module.exports = { buildDocument };
