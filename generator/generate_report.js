// Генератор отчёта. Запускается бэкендом как отдельный процесс.
//
//   node generate_report.js <данные.json> <папка_картинок> <папка_вывода> <режим>
//
// Режимы:
//   docx — собрать документ (быстро, без LibreOffice)
//   pdf — собрать документ и сконвертировать в PDF
//   convert конвертировать уже собранный документ

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Packer } = require("docx");

const { buildDocument } = require("./lib/document");

const DOCX_FILENAME = "otchet.docx";
const LIBREOFFICE_BINARIES = ["soffice", "libreoffice"];

const [, , dataFile, imagesDir, outputDir, mode = "pdf"] = process.argv;

/** Конвертирует docx в PDF рядом с исходником. Возвращает путь или null. */
function convertToPdf(docxPath, targetDir) {
  for (const binary of LIBREOFFICE_BINARIES) {
    try {
      execFileSync(
        binary,
        ["--headless", "--convert-to", "pdf", "--outdir", targetDir, docxPath],
        { stdio: "ignore" },
      );
      const pdfPath = docxPath.replace(/\.docx$/i, ".pdf");
      if (fs.existsSync(pdfPath)) return pdfPath;
    } catch (error) {
      // пробуем следующее имя бинарника
    }
  }
  return null;
}

function main() {
  const docxPath = path.join(outputDir, DOCX_FILENAME);

  if (mode === "convert") {
    if (!fs.existsSync(docxPath)) {
      console.error(`Нечего конвертировать, документ не найден: ${docxPath}`);
      process.exit(1);
    }
    const pdfPath = convertToPdf(docxPath, outputDir);
    console.log(JSON.stringify({ docx: docxPath, pdf: pdfPath }));
    return;
  }

  const report = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const document = buildDocument(report, imagesDir);

  Packer.toBuffer(document).then((buffer) => {
    fs.writeFileSync(docxPath, buffer);
    const pdfPath = mode === "pdf" ? convertToPdf(docxPath, outputDir) : null;
    console.log(JSON.stringify({ docx: docxPath, pdf: pdfPath }));
  });
}

main();
