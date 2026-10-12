import type {NormalizedLandmark} from "@mediapipe/tasks-vision";

// ゲーム本体 (iubeo/frontend/src/player/skeleton) と同じ 15 関節 + 首。
// MediaPipe の 33 点から、IUBEO のプレイヤーと同じ骨格だけを拾う。
export const JOINTS = [
  "head",
  "lShoulder",
  "rShoulder",
  "lElbow",
  "rElbow",
  "lWrist",
  "rWrist",
  "lHip",
  "rHip",
  "lKnee",
  "rKnee",
  "lAnkle",
  "rAnkle",
  "lToe",
  "rToe",
] as const;

type JointName = (typeof JOINTS)[number];

export const JOINT_COUNT = JOINTS.length;
export const NECK = JOINT_COUNT;
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<
  JointName,
  number
>;

// MediaPipe Pose のランドマーク番号。左右は本人から見た向き。
const MP: Record<Exclude<JointName, "head">, number> = {
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
  lToe: 31,
  rToe: 32,
};
const NOSE = 0;
const L_EAR = 7;
const R_EAR = 8;

const BONES: readonly (readonly [number, number])[] = [
  [J.head, NECK],
  [J.lShoulder, J.rShoulder],
  [J.lHip, J.rHip],
  [J.lShoulder, J.lHip],
  [J.rShoulder, J.rHip],
  [J.lShoulder, J.lElbow],
  [J.lElbow, J.lWrist],
  [J.rShoulder, J.rElbow],
  [J.rElbow, J.rWrist],
  [J.lHip, J.lKnee],
  [J.lKnee, J.lAnkle],
  [J.lAnkle, J.lToe],
  [J.rHip, J.rKnee],
  [J.rKnee, J.rAnkle],
  [J.rAnkle, J.rToe],
];

const VISIBLE = 0.5;

// 1 関節あたり [x, y, visibility]。x, y は 0..1 の正規化座標。
export type Body = Float32Array;
export const createBody = (): Body => new Float32Array((JOINT_COUNT + 1) * 3);

const lm = (marks: NormalizedLandmark[], i: number): NormalizedLandmark => {
  const m = marks[i];
  if (!m) {
    throw new Error(`landmark ${i} missing`);
  }
  return m;
};

const set = (out: Body, j: number, x: number, y: number, v: number) => {
  out[j * 3] = x;
  out[j * 3 + 1] = y;
  out[j * 3 + 2] = v;
};

const get = (b: Body, j: number, k: 0 | 1 | 2): number => b[j * 3 + k] ?? 0;

export const toBody = (marks: NormalizedLandmark[], out: Body): Body => {
  for (const [name, i] of Object.entries(MP)) {
    const m = lm(marks, i);
    set(out, J[name as JointName], m.x, m.y, m.visibility ?? 1);
  }
  // 頭は鼻と両耳の中心。ゲームと同じく丸ひとつで描く。
  const nose = lm(marks, NOSE);
  const le = lm(marks, L_EAR);
  const re = lm(marks, R_EAR);
  set(
    out,
    J.head,
    (nose.x + le.x + re.x) / 3,
    (nose.y + le.y + re.y) / 3,
    Math.max(nose.visibility ?? 1, le.visibility ?? 1, re.visibility ?? 1),
  );
  set(
    out,
    NECK,
    (get(out, J.lShoulder, 0) + get(out, J.rShoulder, 0)) / 2,
    (get(out, J.lShoulder, 1) + get(out, J.rShoulder, 1)) / 2,
    Math.min(get(out, J.lShoulder, 2), get(out, J.rShoulder, 2)),
  );
  return out;
};

// 見失いにくい胴体の中心。トラッキングの照合に使う。
export const centerOf = (b: Body): [number, number] => [
  (get(b, J.lShoulder, 0) +
    get(b, J.rShoulder, 0) +
    get(b, J.lHip, 0) +
    get(b, J.rHip, 0)) /
    4,
  (get(b, J.lShoulder, 1) +
    get(b, J.rShoulder, 1) +
    get(b, J.lHip, 1) +
    get(b, J.rHip, 1)) /
    4,
];

export const smooth = (into: Body, next: Body, alpha: number) => {
  for (let i = 0; i < into.length; i++) {
    into[i] = (into[i] ?? 0) + ((next[i] ?? 0) - (into[i] ?? 0)) * alpha;
  }
};

export interface View {
  // 正規化座標 -> 画面 px。カメラ映像を cover で画面に合わせ、左右反転する。
  x: (n: number) => number;
  y: (n: number) => number;
  // 正規化座標系の 1 単位あたり px (縦横共通)。
  unit: number;
}

export const coverView = (
  vw: number,
  vh: number,
  cw: number,
  ch: number,
): View => {
  const scale = Math.max(cw / vw, ch / vh);
  const w = vw * scale;
  const h = vh * scale;
  const ox = (cw - w) / 2;
  const oy = (ch - h) / 2;
  return {
    x: (n) => ox + (1 - n) * w,
    y: (n) => oy + n * h,
    unit: scale,
  };
};

// ゲームの PlayerSkeleton と同じ比率 (m 単位)。
const BONE_RADIUS = 0.015;
const JOINT_RADIUS = 0.03;
const HEAD_RADIUS = 0.11;
const OUTLINE_WIDTH = 0.008;
const FILL = "#ffffff";
const OUTLINE = "#1a1a1a";

// 胴の長さと肩幅から、画面上の 1m を推定する。
export const metersToPx = (b: Body, view: View, vw: number, vh: number) => {
  const dx = (a: number, c: number) =>
    (get(b, a, 0) - get(b, c, 0)) * vw * view.unit;
  const dy = (a: number, c: number) =>
    (get(b, a, 1) - get(b, c, 1)) * vh * view.unit;
  const shoulder = Math.hypot(
    dx(J.lShoulder, J.rShoulder),
    dy(J.lShoulder, J.rShoulder),
  );
  const torso = Math.hypot(
    (get(b, J.lHip, 0) + get(b, J.rHip, 0) - get(b, NECK, 0) * 2) *
      0.5 *
      vw *
      view.unit,
    (get(b, J.lHip, 1) + get(b, J.rHip, 1) - get(b, NECK, 1) * 2) *
      0.5 *
      vh *
      view.unit,
  );
  return Math.max(shoulder / 0.38, torso / 0.5);
};

export const drawBody = (
  ctx: CanvasRenderingContext2D,
  b: Body,
  view: View,
  m: number,
  alpha: number,
) => {
  const px = (j: number) => view.x(get(b, j, 0));
  const py = (j: number) => view.y(get(b, j, 1));
  const seen = (j: number) => get(b, j, 2) >= VISIBLE;

  const pass = (grow: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = (BONE_RADIUS + grow) * 2 * m;
    ctx.beginPath();
    for (const [a, c] of BONES) {
      if (!seen(a) || !seen(c)) {
        continue;
      }
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(c), py(c));
    }
    ctx.stroke();
    for (let j = 0; j < JOINT_COUNT; j++) {
      if (!seen(j)) {
        continue;
      }
      const r = (j === J.head ? HEAD_RADIUS : JOINT_RADIUS) + grow;
      ctx.beginPath();
      ctx.arc(px(j), py(j), r * m, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  ctx.save();
  ctx.globalAlpha = alpha;
  pass(OUTLINE_WIDTH, OUTLINE);
  pass(0, FILL);
  ctx.restore();
};

// MediaPipe は複数人モードで、同じ人にほぼ重なる骨格を何本も返すことがある。
// 見えている関節の外接矩形が大きく重なる骨格は同じ人とみなし、よく見えている方だけ残す。
const DUPLICATE_OVERLAP = 0.5;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// aspect = 映像の横 / 縦。正規化座標の x を y と同じ尺度に揃える。
const boundsOf = (b: Body, aspect: number): Box | null => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let j = 0; j < JOINT_COUNT; j++) {
    if (get(b, j, 2) < VISIBLE) {
      continue;
    }
    const x = get(b, j, 0) * aspect;
    const y = get(b, j, 1);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return x0 < x1 && y0 < y1 ? {x0, y0, x1, y1} : null;
};

const area = (r: Box) => (r.x1 - r.x0) * (r.y1 - r.y0);

// 小さい方の矩形のうち、どれだけが相手に含まれるか。体の一部だけの重複も拾える。
const overlap = (a: Box, b: Box) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) {
    return 0;
  }
  return (w * h) / Math.min(area(a), area(b));
};

const scoreOf = (b: Body) => {
  let sum = 0;
  for (let j = 0; j < JOINT_COUNT; j++) {
    sum += get(b, j, 2);
  }
  return sum;
};

export const dedupe = (bodies: Body[], aspect: number): Body[] => {
  const ranked = bodies
    .map((body) => ({body, box: boundsOf(body, aspect), score: scoreOf(body)}))
    .filter((c): c is {body: Body; box: Box; score: number} => c.box !== null)
    .sort((a, b) => b.score - a.score);
  const kept: typeof ranked = [];
  for (const c of ranked) {
    if (kept.every((k) => overlap(k.box, c.box) < DUPLICATE_OVERLAP)) {
      kept.push(c);
    }
  }
  return kept.map((k) => k.body);
};
