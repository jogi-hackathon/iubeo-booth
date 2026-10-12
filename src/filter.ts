// One Euro Filter (Casiez et al. 2012)。止まっている間は強くならし、
// 速く動いた分だけ追従を上げる。ランドマークの細かい震えを抑えつつ、遅れを出さない。
const params = new URLSearchParams(location.search);
// 止まっているときのカットオフ周波数 (Hz)。小さいほど静止時の震えが減る。
const MIN_CUTOFF = Number(params.get("cutoff") ?? 0.8);
// 速さに応じてカットオフを上げる係数。大きいほど速い動きへの遅れが減る。
const BETA = Number(params.get("beta") ?? 6);
const D_CUTOFF = 1;

// visibility は座標より遅くならす。骨がしきい値付近で点いたり消えたりしないように。
const VISIBILITY_TAU_S = 0.15;

const smoothing = (cutoff: number, dt: number) => {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
};

export interface BodyFilter {
  value: Float32Array;
  speed: Float32Array;
  at: number;
}

export const createFilter = (initial: Float32Array, now: number): BodyFilter => ({
  value: Float32Array.from(initial),
  speed: new Float32Array(initial.length),
  at: now,
});

// 関節ごとに [x, y, visibility] の並び。x, y を One Euro、visibility を指数平滑でならす。
export const step = (f: BodyFilter, next: Float32Array, now: number) => {
  const dt = Math.max(1e-3, (now - f.at) / 1000);
  f.at = now;
  const visAlpha = 1 - Math.exp(-dt / VISIBILITY_TAU_S);
  for (let i = 0; i < f.value.length; i++) {
    const prev = f.value[i] ?? 0;
    const x = next[i] ?? 0;
    if (i % 3 === 2) {
      f.value[i] = prev + (x - prev) * visAlpha;
      continue;
    }
    const raw = (x - prev) / dt;
    const dPrev = f.speed[i] ?? 0;
    const d = dPrev + (raw - dPrev) * smoothing(D_CUTOFF, dt);
    f.speed[i] = d;
    const cutoff = MIN_CUTOFF + BETA * Math.abs(d);
    f.value[i] = prev + (x - prev) * smoothing(cutoff, dt);
  }
};
