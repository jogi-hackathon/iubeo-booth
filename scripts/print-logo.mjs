// IUBEO のロゴを A3 1 枚で刷る入稿データにする。100均のボードに貼って、ブースに立てる想定。
//
//   print/logo-a3.pdf      A3 横、白黒
//   print/png/logo-a3.png  上を 300 dpi の PNG にしたもの (macOS のみ)
//
// 形は iubeo/docs/assets/iubeo_logo.svg のまま。文字ごとに縦だけ半分に縮める変形が掛かっていて、
// 線の太さも一緒に縮むので、縦線は横線のちょうど 2 倍の太さになる。PDF でも同じ変形を掛けて線を引く。
import {mkdir, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {A3, buildPdf, MARK, marks, n, PT, ruler, text, toPng} from "./lib/pdf.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "print");

// ---- ロゴの形 (SVG の座標: y は下向き) ------------------------------------------
const STROKE = 109.36;
const INK = "0.051 G"; // SVG と同じ #0d0d0d

// SVG の transform="matrix(a,b,c,d,e,f)"。どれも回転を含まないので a, d, e, f だけ使う
const compose = (o, i) => [o[0] * i[0], 0, 0, o[3] * i[3], o[0] * i[4] + o[4], o[3] * i[5] + o[5]];
const E = compose(
  [1.001262, 0, 0, 1.001262, -0.781958, -2.523829],
  [0.962382, 0, 0, 0.481911, 179.648169, 1037.383312],
);
const B = compose(
  [1.001262, 0, 0, 1.001262, -58.855149, -2.523829],
  [0.962382, 0, 0, 0.481911, -39.293751, 1037.383312],
);
const STROKES = [
  {m: [0.963597, 0, 0, 0.482519, -251.15293, 1036.168572], pts: [[492, 326], [492, 3669]]},
  {m: [0.963597, 0, 0, 0.482519, 267.261992, 1036.168572], pts: [[492, 326], [492, 3669], [1347.009, 2813.991], [1347.009, 1616]]},
  {m: B, pts: [[2107, 326], [2107, 2785]]},
  {m: B, pts: [[2107, 326], [3000, 326], [2107, 1555.5], [3000, 1555.5], [2107, 3669]]},
  {m: E, pts: [[2326, 3669], [4005, 3669], [4005, 326], [3365, 326]]},
  {m: E, pts: [[4005, 1997.5], [3000, 2000]]},
  {m: [0.963597, 0, 0, -0.482519, 344.306327, 2963.831428], pts: [[4311, 326], [4339, 3669], [5638, 3669], [4580, 769]]},
];

// 線の太さと角まで含めた外形の範囲 (SVG の座標)。
// 端は四角い線端、角は丸い継ぎ目なので、各頂点の周りに「縮めた線幅の半分」を足せば収まる
const bounds = () => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const {m, pts} of STROKES) {
    const hx = (STROKE / 2) * Math.abs(m[0]);
    const hy = (STROKE / 2) * Math.abs(m[3]);
    for (const [x, y] of pts) {
      const X = m[0] * x + m[4];
      const Y = m[3] * y + m[5];
      x0 = Math.min(x0, X - hx);
      x1 = Math.max(x1, X + hx);
      y0 = Math.min(y0, Y - hy);
      y1 = Math.max(y1, Y + hy);
    }
  }
  return {x0, y0, x1, y1};
};

// ロゴを、左下 (ox, oy) mm から幅 width mm で描く命令
const logoOps = (ox, oy, width) => {
  const b = bounds();
  const s = width / (b.x1 - b.x0);
  const ops = ["q", `${n(s)} 0 0 ${n(-s)} ${n(ox - b.x0 * s)} ${n(oy + b.y1 * s)} cm`, INK, "2 J 1 j"];
  for (const {m, pts} of STROKES) {
    ops.push("q", `${m[0]} 0 0 ${m[3]} ${m[4]} ${m[5]} cm`, `${STROKE} w`);
    pts.forEach(([x, y], i) => ops.push(`${x} ${y} ${i ? "l" : "m"}`));
    ops.push("S", "Q");
  }
  ops.push("Q");
  return {ops, height: (b.y1 - b.y0) * s};
};

// ---- A3 のページ ----------------------------------------------------------------
// ロゴの幅。白い余白 20 mm を付けて切ると 390 mm 前後のカードになり、A3 の印刷できる範囲に収まる
const LOGO_W = 350;
const MARGIN = 20;

const page = () => {
  const [pw, ph] = [A3[1], A3[0]];
  const {height} = logoOps(0, 0, LOGO_W);
  const card = {w: LOGO_W + MARGIN * 2, h: height + MARGIN * 2};
  const cx = (pw - card.w) / 2;
  const cy = (ph - card.h) / 2 + 6; // 下の余白にラベルを置くぶん少し上げる
  const out = [`q ${n(PT)} 0 0 ${n(PT)} 0 0 cm`];
  out.push(...logoOps(cx + MARGIN, cy + MARGIN, LOGO_W).ops);

  // 白い余白の外周を切るトンボ
  const m = marks();
  const gap = 2;
  for (const x of [cx, cx + card.w]) {
    m.line(x, cy - gap, x, cy - gap - MARK);
    m.line(x, cy + card.h + gap, x, cy + card.h + gap + MARK);
  }
  for (const y of [cy, cy + card.h]) {
    m.line(cx - gap, y, cx - gap - MARK, y);
    m.line(cx + card.w + gap, y, cx + card.w + gap + MARK, y);
  }
  out.push(...m.ops);
  out.push(...ruler(pw - 12 - 50, 8));
  out.push("Q");
  out.push(text(12, 11, 2.6, `IUBEO LOGO   A3  1/1   logo ${LOGO_W} x ${height.toFixed(0)} mm, card ${card.w} x ${card.h.toFixed(0)} mm`, "0.2"));
  out.push(text(12, 7.4, 2.1, "Print on A3 landscape at 100% (actual size). Cut along the marks, or glue the whole sheet to a board."));
  out.push(text(pw - 12 - 50, 4.7, 2.1, "50 mm"));
  return {size: [pw, ph], content: out.join("\n"), card, height};
};

await mkdir(OUT, {recursive: true});
const p = page();
await writeFile(join(OUT, "logo-a3.pdf"), buildPdf([p]));
await toPng(join(OUT, "logo-a3.pdf"), join(OUT, "png"), ["logo-a3"]);
console.log(`logo ${LOGO_W} × ${p.height.toFixed(1)} mm / card ${p.card.w} × ${p.card.h.toFixed(1)} mm`);
