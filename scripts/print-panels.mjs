// ゲーム内のファイル (Web Search・画像生成・Write) を、ブースに掛けるパネルの入稿データにする。
// 形と寸法比は iubeo/frontend/src/items/fileModel のモデルをそのまま写す。
//
//   print/file-panels-a3-tiles.pdf  A2 のパネル 1 枚を A3 2 枚に分けたもの。コンビニで刷れる
//   print/file-panels-a2.pdf        A2 1 枚刷り。キンコーズなど A2 を刷れる店向け
//   print/file-panels-a4.pdf        A4 1 枚刷り。家やコンビニのプリンタ向け
//   print/png/*.png                 A4 版を 300 dpi の PNG にしたもの (macOS の swift で変換)
//
// 座標はすべて mm、y は上向き。
import {mkdir, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {A2, A3, A4, buildPdf, MARK, marks, n, PT, ruler, text, toPng} from "./lib/pdf.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "print");

// ゲーム内の 1 m を何 mm に拡大するか。3 枚とも同じ倍率にして、ゲームと同じ大きさの関係を保つ。
// A2 版は 4400 (0.1 m → 440 mm) で、どれも A2 (420×594) に収まり、A3 2 枚に分けられる。
// A4 版は 2000 (0.1 m → 200 mm) で、トンボまで含めて A4 1 枚に収まる。
const SCALE_A2 = 4400;
const SCALE_A4 = 2000;
const BLEED = 3; // 仕上がり線の外に伸ばす黒。切りずれても白が出ないように
const TAB = 12; // 継ぎ目で下になる側に残すのりしろ

// ---- ファイルの形 (モデル座標: m、原点は中心、y は上) ------------------------
const FILES = {
  search: {
    title: "WEB SEARCH",
    w: 0.1,
    h: 0.08,
    outline: 0.0045,
    // 白は題字バーの下だけに敷く。黒を白の縁にぴったり重ねると、刷り上がりに細い線が出ることがある
    body(s) {
      const bodyH = this.h - 0.016;
      s.rect(0, -this.h / 2 + bodyH / 2, this.w, bodyH, "white");
    },
    draw(s) {
      const titleH = 0.016;
      const titleY = (this.h - titleH) / 2;
      for (let i = 0; i < 3; i++) {
        s.circle(-this.w / 2 + 0.01 + i * 0.009, titleY, 0.0032, "white");
      }
      const fw = 0.072;
      const fh = 0.022;
      const fy = 0.008;
      const border = 0.003;
      s.rect(0, fy, fw, fh, "ink");
      s.rect(0, fy, fw - border * 2, fh - border * 2, "white");
      const lx = fw / 2 - 0.014;
      const ly = fy + 0.0015;
      s.circle(lx, ly, 0.0052, "ink");
      s.circle(lx, ly, 0.003, "white");
      s.rect(lx + 0.0042, ly - 0.0042, 0.005, 0.0016, "ink", -Math.PI / 4);
      s.rect(-0.004, -0.012, 0.064, 0.005, "ink");
      s.rect(-0.01, -0.022, 0.052, 0.005, "ink");
    },
  },
  image: {
    title: "IMAGE GENERATION",
    w: 0.1,
    h: 0.08,
    outline: 0.004,
    // 額縁の内側だけを白にする。額縁は下地の黒がそのまま残る
    body(s) {
      const bar = 0.012;
      s.rect(0, 0, this.w - bar * 2, this.h - bar * 2, "white");
    },
    draw(s) {
      const bar = 0.012;
      const inner = this.h - bar * 2;
      const mountain = (x, w, h) => {
        const base = -inner / 2 - 0.004;
        s.poly([[x - w / 2, base], [x + w / 2, base], [x, base + h]], "ink");
      };
      // 山の裾は額縁の下辺に食い込むが、そこは下地の黒なので見えない
      mountain(-0.014, 0.036, 0.03);
      mountain(0.021, 0.024, 0.02);
      s.circle(0.024, 0.012, 0.01, "ink");
    },
  },
  write: {
    title: "WRITE",
    w: 0.08,
    h: 0.1,
    outline: 0.004,
    draw(s) {
      const left = -0.03;
      const lines = [[0.03, 0.06], [0.015, 0.052], [0, 0.06], [-0.015, 0.044], [-0.03, 0.03]];
      for (const [y, w] of lines) {
        s.rect(left + w / 2, y, w, 0.006, "ink");
      }
    },
  },
};

// 仕上がりの外寸 (mm)。縁取りの外側まで
const sizeOf = (f, scale) => [(f.w + f.outline * 2) * scale, (f.h + f.outline * 2) * scale];

// ---- PDF の描画命令 -----------------------------------------------------------
const GRAY = {ink: "0.102 g", white: "1 g"}; // ゲームと同じ #1a1a1a と白

const path = () => {
  const ops = [];
  const api = {
    ops,
    fill: (tone) => ops.push(GRAY[tone]),
    rect: (x, y, w, h) => ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`),
    poly: (pts) => {
      pts.forEach(([x, y], i) => ops.push(`${n(x)} ${n(y)} ${i ? "l" : "m"}`));
      ops.push("h");
    },
    circle: (cx, cy, r) => {
      const k = 0.5523 * r;
      ops.push(
        `${n(cx + r)} ${n(cy)} m`,
        `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
        `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
        `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
        `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c`,
        "h",
      );
    },
  };
  return api;
};

// パネルの絵を、仕上がり左下を原点とする mm 座標で描く
const panelOps = (f, SCALE) => {
  const [W, H] = sizeOf(f, SCALE);
  const p = path();
  const X = (x) => (x + f.w / 2 + f.outline) * SCALE;
  const Y = (y) => (y + f.h / 2 + f.outline) * SCALE;
  const shape = {
    rect: (cx, cy, w, h, tone, rot = 0) => {
      p.fill(tone);
      if (!rot) {
        p.rect(X(cx - w / 2), Y(cy - h / 2), w * SCALE, h * SCALE);
      } else {
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(
          ([x, y]) => [X(cx + x * c - y * s), Y(cy + x * s + y * c)],
        );
        p.poly(pts);
      }
      p.ops.push("f");
    },
    circle: (cx, cy, r, tone) => {
      p.fill(tone);
      p.circle(X(cx), Y(cy), r * SCALE);
      p.ops.push("f");
    },
    poly: (pts, tone) => {
      p.fill(tone);
      p.poly(pts.map(([x, y]) => [X(x), Y(y)]));
      p.ops.push("f");
    },
  };
  // 縁取りを塗り足しの分まで黒く広げ、その内側を白にする
  p.fill("ink");
  p.rect(-BLEED, -BLEED, W + BLEED * 2, H + BLEED * 2);
  p.ops.push("f");
  if (f.body) {
    f.body(shape);
  } else {
    shape.rect(0, 0, f.w, f.h, "white");
  }
  f.draw(shape);
  return p.ops;
};

// ---- ページ組み ----------------------------------------------------------------
// page: {size:[w,h], region:{x0,y0,x1,y1} 仕上がり座標で刷る範囲, origin:[x,y] 仕上がり原点の紙上の位置,
//        cuts: 仕上がり座標で切る線, seams: 合わせ目の印}
const pageContent = (f, page) => {
  const {region: r, origin: [ox, oy]} = page;
  const out = [];
  out.push(`q ${n(PT)} 0 0 ${n(PT)} 0 0 cm`);

  // 絵: 刷る範囲で切り抜いてから、仕上がり原点へ移す
  out.push("q", `${n(ox + r.x0)} ${n(oy + r.y0)} ${n(r.x1 - r.x0)} ${n(r.y1 - r.y0)} re W n`);
  out.push(`1 0 0 1 ${n(ox)} ${n(oy)} cm`, ...panelOps(f, page.scale), "Q");

  // トンボ: 仕上がり線の延長を、刷る範囲の外側に引く
  const m = marks();
  const gap = 1;
  for (const x of page.cutX) {
    m.line(ox + x, oy + r.y0 - gap, ox + x, oy + r.y0 - gap - MARK);
    m.line(ox + x, oy + r.y1 + gap, ox + x, oy + r.y1 + gap + MARK);
  }
  for (const y of page.cutY) {
    m.line(ox + r.x0 - gap, oy + y, ox + r.x0 - gap - MARK, oy + y);
    m.line(ox + r.x1 + gap, oy + y, ox + r.x1 + gap + MARK, oy + y);
  }
  out.push(...m.ops);

  // 合わせ目: のりしろ側には「もう 1 枚の端をここに合わせる」印を破線で
  if (page.seam) {
    const s = marks();
    s.ops.push("[1 1] 0 d");
    const {axis, at} = page.seam;
    if (axis === "x") {
      s.line(ox + at, oy + r.y0 - gap, ox + at, oy + r.y0 - gap - MARK);
      s.line(ox + at, oy + r.y1 + gap, ox + at, oy + r.y1 + gap + MARK);
    } else {
      s.line(ox + r.x0 - gap, oy + at, ox + r.x0 - gap - MARK, oy + at);
      s.line(ox + r.x1 + gap, oy + at, ox + r.x1 + gap + MARK, oy + at);
    }
    s.ops.push("[] 0 d");
    out.push(...s.ops);
  }

  // ラベルと目盛りは紙の下端の余白に
  const [pw] = page.size;
  out.push(...ruler(pw - 12 - 50, 6.5));
  out.push("Q");
  out.push(text(12, 9, 2.6, `IUBEO FILE PANEL - ${f.title}   ${page.label}`, "0.2"));
  out.push(text(12, 5.6, 2.1, page.note));
  out.push(text(pw - 12 - 50, 3.2, 2.1, "50 mm"));
  return out.join("\n");
};

// 1 枚のパネルを A3 2 枚に分ける。横長は左右、縦長は上下に割る
const tilePages = (f) => {
  const [W, H] = sizeOf(f, SCALE_A2);
  const landscape = W >= H;
  const pages = [];
  const center = (size, r) => [
    (size[0] - (r.x1 - r.x0)) / 2 - r.x0,
    (size[1] - (r.y1 - r.y0)) / 2 - r.y0 + 4, // 下の余白にラベルを置くぶん少し上げる
  ];
  if (landscape) {
    const seam = W / 2;
    const size = A3;
    const left = {x0: -BLEED, y0: -BLEED, x1: seam + TAB, y1: H + BLEED};
    const right = {x0: seam - BLEED, y0: -BLEED, x1: W + BLEED, y1: H + BLEED};
    pages.push({
      size, region: left, origin: center(size, left),
      cutX: [0], cutY: [0, H], seam: {axis: "x", at: seam},
      scale: SCALE_A2,
      label: "A  LEFT  1/2",
      note: "Print on A3 at 100% (actual size). Keep the glue tab on the right; B goes on top, edge on the dashed marks.",
    });
    pages.push({
      size, region: right, origin: center(size, right),
      cutX: [seam, W], cutY: [0, H],
      scale: SCALE_A2,
      label: "B  RIGHT  2/2",
      note: "Print on A3 at 100% (actual size). Cut along all marks, including the left edge, then lay over A.",
    });
  } else {
    const seam = H / 2;
    const size = [A3[1], A3[0]];
    const top = {x0: -BLEED, y0: seam - TAB, x1: W + BLEED, y1: H + BLEED};
    const bottom = {x0: -BLEED, y0: -BLEED, x1: W + BLEED, y1: seam + BLEED};
    pages.push({
      size, region: top, origin: center(size, top),
      cutX: [0, W], cutY: [H], seam: {axis: "y", at: seam},
      scale: SCALE_A2,
      label: "A  TOP  1/2",
      note: "Print on A3 landscape at 100% (actual size). Keep the glue tab at the bottom; B goes on top, edge on the dashed marks.",
    });
    pages.push({
      size, region: bottom, origin: center(size, bottom),
      cutX: [0, W], cutY: [0, seam],
      scale: SCALE_A2,
      label: "B  BOTTOM  2/2",
      note: "Print on A3 landscape at 100% (actual size). Cut along all marks, including the top edge, then lay over A.",
    });
  }
  return pages;
};

// 1 枚刷り。横長のパネルは用紙も横向きにする
const sheetPage = (f, paper, scale, name) => {
  const [W, H] = sizeOf(f, scale);
  const size = W >= H ? [paper[1], paper[0]] : paper;
  const region = {x0: -BLEED, y0: -BLEED, x1: W + BLEED, y1: H + BLEED};
  return {
    size, region,
    origin: [(size[0] - W) / 2, (size[1] - H) / 2 + 4],
    cutX: [0, W], cutY: [0, H],
    scale,
    label: `${name}  1/1`,
    note: `Print on ${name} at 100% (actual size). Cut along the marks.`,
  };
};

const files = Object.values(FILES);
await mkdir(OUT, {recursive: true});
await writeFile(
  join(OUT, "file-panels-a3-tiles.pdf"),
  buildPdf(files.flatMap((f) => tilePages(f).map((p) => ({size: p.size, content: pageContent(f, p)})))),
);
const sheets = (paper, scale, name) =>
  buildPdf(files.map((f) => {
    const p = sheetPage(f, paper, scale, name);
    return {size: p.size, content: pageContent(f, p)};
  }));
await writeFile(join(OUT, "file-panels-a2.pdf"), sheets(A2, SCALE_A2, "A2"));
await writeFile(join(OUT, "file-panels-a4.pdf"), sheets(A4, SCALE_A4, "A4"));

// A4 版を 300 dpi の PNG に
await toPng(join(OUT, "file-panels-a4.pdf"), join(OUT, "png"), Object.keys(FILES).map((k) => `file-panel-a4-${k}`));

for (const [name, scale] of [["A2", SCALE_A2], ["A4", SCALE_A4]]) {
  for (const f of files) {
    const [W, H] = sizeOf(f, scale);
    console.log(`${name}  ${f.title.padEnd(17)} ${W.toFixed(1)} × ${H.toFixed(1)} mm`);
  }
}
