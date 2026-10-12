// 入稿データ用の小さな PDF 書き出し。依存を増やさないため自前で組み立てる。
// ページの中身は PDF の描画命令を文字列で渡す。座標は pt なので、mm で描くときは最初に PT 倍の cm を掛ける。
import {execFileSync} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

export const A2 = [420, 594];
export const A3 = [297, 420];
export const A4 = [210, 297];

export const PT = 72 / 25.4;
export const n = (v) => (Math.round(v * 1000) / 1000).toString();

// ---- トンボ・ラベル ------------------------------------------------------------
export const MARK = 4; // トンボの長さ
export const marks = () => {
  const ops = ["0 G", "0.12 w"];
  const line = (x1, y1, x2, y2) => ops.push(`${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
  return {ops, line};
};

export const text = (x, y, size, str, gray = "0.35") =>
  `BT /F1 ${n(size * PT)} Tf ${gray} g ${n(x * PT)} ${n(y * PT)} Td (${str.replace(/[()\\]/g, "\\$&")}) Tj ET`;

// 50 mm の目盛り。刷り上がりで測り、100% で刷れたか確かめる
export const ruler = (x, y) => {
  const m = marks();
  m.line(x, y, x + 50, y);
  for (let i = 0; i <= 5; i++) {
    m.line(x + i * 10, y, x + i * 10, y + (i % 5 ? 1.5 : 3));
  }
  return m.ops;
};

// ---- PDF の書き出し ------------------------------------------------------------
export const buildPdf = (pages) => {
  const objs = [];
  const add = (body) => (objs.push(body), objs.length);
  const catalog = add(null);
  const pagesId = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = [];
  for (const {size, content} of pages) {
    const stream = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    kids.push(add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(size[0] * PT)} ${n(size[1] * PT)}] ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`,
    ));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
};

// PDF の各ページを PNG にする。描画は macOS の PDFKit に任せるので、ほかの OS では何もしない
export const toPng = async (pdf, outDir, names, dpi = 300) => {
  if (process.platform !== "darwin") {
    console.log("PNG は macOS でだけ書き出す (swift の PDFKit を使うため)");
    return;
  }
  await mkdir(outDir, {recursive: true});
  const swift = join(dirname(fileURLToPath(import.meta.url)), "..", "pdf-to-png.swift");
  execFileSync("swift", [swift, pdf, outDir, String(dpi), ...names], {stdio: "inherit"});
};
