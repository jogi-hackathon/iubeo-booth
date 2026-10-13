// 依頼伝票の絵。ゲームの伝票 (iubeo/frontend/src/game/slip/content.ts の paintSlip) を写す。
// ゲームは 58 × 120 mm の紙を幅 320 px で描く。ここでも幅 320 の座標で描き、紙の縦横比だけを変えられるようにする。

export type SlipItem = {
  /** タスクの種類の表示名 */
  kind: string;
  /** 種類ごとの対象 (検索のお題・対象ファイルの色)。無ければ null */
  detail: string | null;
};

export type SlipContent = {
  number: string;
  phase: number;
  items: readonly SlipItem[];
  /** 制限 (秒)。null なら "--" */
  limitSeconds: number | null;
};

/** ゲームのタスクの表示名 (frontend/src/game/hudText.ts の taskLabels) */
export const TASK_KINDS = ["検索", "読み込みと編集", "書き込み", "画像生成"] as const;

/** ゲームの見本の伝票 */
export const SAMPLE_SLIP: SlipContent = {
  number: "3-TASK31",
  phase: 3,
  items: [
    {kind: "検索", detail: "React Three Fiber"},
    {kind: "読み込みと編集", detail: "橙のファイル"},
    {kind: "書き込み", detail: null},
  ],
  limitSeconds: 120,
};

/** 描く座標の幅。ゲームと同じ */
export const SLIP_WIDTH_PX = 320;

const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
const MONO = `"Menlo", "Courier New", ${FONT}`;
const INK = "#1a1a1a";
const EDGE = 3;
const TOOTH = {width: 12, height: 7} as const;
const MARGIN = 26;
const ITEM_MAX_SLOT = 40;

const paperPath = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.beginPath();
  ctx.moveTo(0, TOOTH.height);
  for (let x = 0; x < w; x += TOOTH.width) {
    ctx.lineTo(x + TOOTH.width / 2, 0);
    ctx.lineTo(Math.min(w, x + TOOTH.width), TOOTH.height);
  }
  ctx.lineTo(w, h - TOOTH.height);
  for (let x = w; x > 0; x -= TOOTH.width) {
    ctx.lineTo(x - TOOTH.width / 2, h);
    ctx.lineTo(Math.max(0, x - TOOTH.width), h - TOOTH.height);
  }
  ctx.closePath();
};

const dashed = (ctx: CanvasRenderingContext2D, y: number, w: number) => {
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(w - MARGIN, y);
  ctx.stroke();
  ctx.restore();
};

/** 伝票番号から決まるバーコード風の縞 */
const barcode = (ctx: CanvasRenderingContext2D, number: string, y: number, w: number, h: number) => {
  let seed = 7;
  for (const ch of number) {
    seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  }
  ctx.fillStyle = INK;
  let x = MARGIN;
  while (x < w - MARGIN) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bar = 2 + ((seed >>> 16) & 3);
    const gap = 2 + ((seed >>> 20) & 3);
    ctx.fillRect(x, y, Math.min(bar, w - MARGIN - x), h);
    x += bar + gap;
  }
};

const fitFontSize = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number) => {
  for (let size = max; size > min; size -= 2) {
    ctx.font = `bold ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
  }
  return min;
};

const itemLine = (item: SlipItem, i: number) =>
  item.detail === null || item.detail === "" ? `${i + 1}. ${item.kind}` : `${i + 1}. ${item.kind} / ${item.detail}`;

/**
 * 伝票を描く。ctx は幅 SLIP_WIDTH_PX、高さ h の座標で描けるよう、呼び出し側で拡大しておく。
 * background を渡すと紙の外 (ギザギザの外) をその色で塗る。印刷用は白で塗る
 */
export const paintSlip = (ctx: CanvasRenderingContext2D, h: number, content: SlipContent, background: string | null) => {
  const w = SLIP_WIDTH_PX;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }
  paperPath(ctx, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = EDGE * 2;
  ctx.strokeStyle = INK;
  ctx.save();
  ctx.clip();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText("依 頼", w / 2, 78);
  ctx.font = `14px ${MONO}`;
  ctx.fillText("* * *  ORDER SLIP  * * *", w / 2, 102);
  dashed(ctx, 118, w);

  ctx.textAlign = "left";
  ctx.font = `17px ${MONO}`;
  ctx.fillText(`No. ${content.number}`, MARGIN, 148);
  ctx.textAlign = "right";
  ctx.fillText(`PHASE ${content.phase}`, w - MARGIN, 148);
  dashed(ctx, 166, w);

  ctx.textAlign = "left";
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`タスク ${content.items.length} 件`, MARGIN, 196);

  // 項目は紙の残り (制限の行とバーコードの上) に収める。多いほど詰める
  const top = 212;
  const bottom = h - 170;
  const slot = Math.min(ITEM_MAX_SLOT, (bottom - top) / Math.max(1, content.items.length));
  const lines = content.items.map(itemLine);
  const size = Math.min(
    Math.round(slot * 0.6),
    ...lines.map((line) => fitFontSize(ctx, line, w - 2 * MARGIN, Math.round(slot * 0.6), 10)),
  );
  ctx.font = `bold ${size}px ${FONT}`;
  lines.forEach((line, i) => {
    ctx.fillText(line, MARGIN, top + slot * i + (slot + size) / 2 - 2);
  });

  const y = bottom + 6;
  dashed(ctx, y, w);
  ctx.font = `17px ${MONO}`;
  ctx.fillText("制限", MARGIN, y + 30);
  ctx.textAlign = "right";
  ctx.fillText(content.limitSeconds === null ? "--" : `${content.limitSeconds} 秒`, w - MARGIN, y + 30);

  barcode(ctx, content.number, h - 118, w, 44);
  ctx.textAlign = "center";
  ctx.font = `12px ${MONO}`;
  ctx.fillText("IUBEO", w / 2, h - 56);
};
