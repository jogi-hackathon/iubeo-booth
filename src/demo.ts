import type {NormalizedLandmark} from "@mediapipe/tasks-vision";

// カメラなしで画面を確かめるための、歩く人の合成ランドマーク (?demo)。
// MediaPipe と同じ 33 点の並びで返すので、本番と同じ経路で描ける。
interface Walker {
  x: number;
  speed: number;
  phase: number;
  height: number;
  y: number;
}

const walkers: Walker[] = [
  {x: 0.3, speed: 0.045, phase: 0, height: 0.62, y: 0.2},
  {x: 0.75, speed: -0.03, phase: 1.7, height: 0.5, y: 0.3},
];

const point = (x: number, y: number): NormalizedLandmark => ({
  x,
  y,
  z: 0,
  visibility: 0.99,
});

const pose = (w: Walker, t: number): NormalizedLandmark[] => {
  const s = w.height;
  const swing = Math.sin(t * 5 + w.phase);
  const marks = Array.from({length: 33}, () => ({...point(0, 0), visibility: 0}));
  // 正規化座標は横が 16:9 で縮むので、x だけ縦横比で割り戻す。
  const at = (dx: number, dy: number) =>
    point(w.x + dx * s * (9 / 16), w.y + dy * s);
  const head = at(0, 0.08);
  marks[0] = head;
  marks[7] = at(0.04, 0.07);
  marks[8] = at(-0.04, 0.07);
  marks[11] = at(0.1, 0.22);
  marks[12] = at(-0.1, 0.22);
  marks[13] = at(0.13 + swing * 0.04, 0.38);
  marks[14] = at(-0.13 - swing * 0.04, 0.38);
  marks[15] = at(0.13 + swing * 0.09, 0.52);
  marks[16] = at(-0.13 - swing * 0.09, 0.52);
  marks[23] = at(0.07, 0.56);
  marks[24] = at(-0.07, 0.56);
  marks[25] = at(0.08 - swing * 0.08, 0.76);
  marks[26] = at(-0.08 + swing * 0.08, 0.76);
  marks[27] = at(0.08 - swing * 0.15, 0.96);
  marks[28] = at(-0.08 + swing * 0.15, 0.96);
  marks[31] = at(0.1 - swing * 0.15, 1.0);
  marks[32] = at(-0.06 + swing * 0.15, 1.0);
  return marks;
};

export const demoLandmarks = (now: number): NormalizedLandmark[][] => {
  const t = now / 1000;
  const out: NormalizedLandmark[][] = [];
  for (const w of walkers) {
    // 画面の端から端へ歩き、外に出たら少し間を空けて戻ってくる。
    const span = 1.6;
    const raw = (w.x + w.speed * t) % span;
    const x = (raw + span) % span - 0.3;
    if (x < 0.05 || x > 0.95) {
      continue;
    }
    out.push(pose({...w, x}, t));
  }
  return out;
};
