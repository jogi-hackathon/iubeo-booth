import {jsPDF} from "jspdf";

import "./style.css";
import {paintSlip, SAMPLE_SLIP, SLIP_WIDTH_PX, type SlipContent, TASK_KINDS} from "./paint";

// 紙の大きさ。A7 はそのまま A7 の PDF にする。Phomemo T02 のロール紙 (幅 53 mm) に刷ると、アプリが紙の幅に合わせて縮める。
// T02 実寸は印字幅 48 mm (203 dpi で 384 ドット) に合わせ、縦横比はゲームの伝票 (58 × 120 mm) と同じにする
const PAPERS = {
  a7: {w: 74, h: 105, dpi: 300},
  t02: {w: 48, h: (48 * 120) / 58, dpi: 203},
} as const;
type PaperKey = keyof typeof PAPERS;

const MAX_ITEMS = 6;

type State = {
  paper: PaperKey;
  content: {
    number: string;
    phase: number;
    items: {kind: string; detail: string}[];
    limitSeconds: string;
  };
};

const state: State = {
  paper: "a7",
  content: {
    number: SAMPLE_SLIP.number,
    phase: SAMPLE_SLIP.phase,
    items: SAMPLE_SLIP.items.map((i) => ({kind: i.kind, detail: i.detail ?? ""})),
    limitSeconds: String(SAMPLE_SLIP.limitSeconds ?? ""),
  },
};

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) {
    throw new Error(`${sel} not found`);
  }
  return el;
};

const toContent = (): SlipContent => {
  const limit = state.content.limitSeconds.trim();
  return {
    number: state.content.number.trim() || "--------",
    phase: state.content.phase,
    items: state.content.items.map((i) => ({kind: i.kind, detail: i.detail.trim() || null})),
    limitSeconds: limit === "" || Number.isNaN(Number(limit)) ? null : Number(limit),
  };
};

/** 幅 SLIP_WIDTH_PX の座標で描き、横 widthPx の canvas に拡大して描く */
const render = (canvas: HTMLCanvasElement, widthPx: number, background: string | null) => {
  const paper = PAPERS[state.paper];
  const logicalH = (SLIP_WIDTH_PX * paper.h) / paper.w;
  const scale = widthPx / SLIP_WIDTH_PX;
  canvas.width = Math.round(widthPx);
  canvas.height = Math.round(logicalH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2d context unavailable");
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  paintSlip(ctx, logicalH, toContent(), background);
};

// ---- プレビュー -----------------------------------------------------------
const preview = $<HTMLCanvasElement>("#preview");
const sizeNote = $<HTMLParagraphElement>("#sizeNote");
const PREVIEW_CSS_WIDTH = 280;
const redraw = () => {
  const paper = PAPERS[state.paper];
  render(preview, PREVIEW_CSS_WIDTH * Math.min(3, window.devicePixelRatio || 1), null);
  preview.style.width = `${PREVIEW_CSS_WIDTH}px`;
  const px = exportSize();
  sizeNote.textContent = `${paper.w.toFixed(0)} × ${paper.h.toFixed(0)} mm ・ 画像 ${px.w} × ${px.h} px（${paper.dpi} dpi）`;
};

const exportSize = () => {
  const paper = PAPERS[state.paper];
  const w = Math.round((paper.w / 25.4) * paper.dpi);
  return {w, h: Math.round((w * paper.h) / paper.w)};
};

// ---- 入力 -----------------------------------------------------------------
const numberInput = $<HTMLInputElement>("#number");
const phaseInput = $<HTMLInputElement>("#phase");
const limitInput = $<HTMLInputElement>("#limit");
const itemsList = $<HTMLOListElement>("#items");
const addItem = $<HTMLButtonElement>("#addItem");

numberInput.value = state.content.number;
phaseInput.value = String(state.content.phase);
limitInput.value = state.content.limitSeconds;

numberInput.addEventListener("input", () => {
  state.content.number = numberInput.value;
  redraw();
});
phaseInput.addEventListener("input", () => {
  state.content.phase = Math.max(0, Math.round(Number(phaseInput.value) || 0));
  redraw();
});
limitInput.addEventListener("input", () => {
  state.content.limitSeconds = limitInput.value;
  redraw();
});

// 伝票番号は、ゲームと同じく「フェーズ-英数字」の 8 文字にする
$<HTMLButtonElement>("#renumber").addEventListener("click", () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let tail = "";
  for (let i = 0; i < 8; i++) {
    tail += chars[Math.floor(Math.random() * chars.length)];
  }
  state.content.number = `${state.content.phase}-${tail}`.slice(0, 8);
  numberInput.value = state.content.number;
  redraw();
});

const renderItems = () => {
  itemsList.replaceChildren(
    ...state.content.items.map((item, i) => {
      const li = document.createElement("li");
      li.className = "item";
      const kind = document.createElement("select");
      kind.setAttribute("aria-label", `タスク ${i + 1} の種類`);
      for (const k of TASK_KINDS) {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k;
        kind.append(opt);
      }
      kind.value = item.kind;
      kind.addEventListener("change", () => {
        item.kind = kind.value;
        redraw();
      });
      const detail = document.createElement("input");
      detail.type = "text";
      detail.placeholder = "お題・対象（なくてもいい）";
      detail.setAttribute("aria-label", `タスク ${i + 1} のお題・対象`);
      detail.value = item.detail;
      detail.addEventListener("input", () => {
        item.detail = detail.value;
        redraw();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost";
      remove.textContent = "消す";
      remove.setAttribute("aria-label", `タスク ${i + 1} を消す`);
      remove.disabled = state.content.items.length <= 1;
      remove.addEventListener("click", () => {
        state.content.items.splice(i, 1);
        renderItems();
        redraw();
      });
      li.append(kind, detail, remove);
      return li;
    }),
  );
  addItem.disabled = state.content.items.length >= MAX_ITEMS;
};
addItem.addEventListener("click", () => {
  state.content.items.push({kind: "検索", detail: ""});
  renderItems();
  redraw();
});

for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-paper]")) {
  btn.addEventListener("click", () => {
    state.paper = btn.dataset.paper as PaperKey;
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-paper]")) {
      b.setAttribute("aria-pressed", String(b === btn));
    }
    redraw();
  });
}

// ---- 書き出し -------------------------------------------------------------
const fileBase = () => `slip-${(state.content.number.trim() || "slip").replace(/[^0-9A-Za-z-]/g, "")}-${state.paper}`;

const exportCanvas = () => {
  const c = document.createElement("canvas");
  render(c, exportSize().w, "#ffffff");
  return c;
};

const download = (url: string, name: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
};

$<HTMLButtonElement>("#savePng").addEventListener("click", () => {
  exportCanvas().toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    download(url, `${fileBase()}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, "image/png");
});

$<HTMLButtonElement>("#savePdf").addEventListener("click", () => {
  const paper = PAPERS[state.paper];
  const pdf = new jsPDF({unit: "mm", format: [paper.w, paper.h], orientation: "portrait"});
  pdf.addImage(exportCanvas().toDataURL("image/png"), "PNG", 0, 0, paper.w, paper.h);
  pdf.save(`${fileBase()}.pdf`);
});

renderItems();
redraw();
// 和文フォントが読み込まれたら描き直す
void document.fonts?.ready.then(redraw);
