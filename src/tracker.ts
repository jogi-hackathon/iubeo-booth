import {type Body, centerOf, createBody, smooth} from "./skeleton";

export interface Track {
  id: number;
  body: Body;
  bornAt: number;
  seenAt: number;
  // 「彼ら」が付ける適性値。見た目だけの演出。
  fitness: number;
}

const MATCH_DISTANCE = 0.18;
const LOST_AFTER_MS = 900;
const SMOOTHING = 0.55;
const COUNTER_KEY = "iubeo-booth:resource-counter";

// 番号は一日を通して増え続けるように、ブラウザに覚えておく。
const loadCounter = (): number => {
  try {
    const v = Number(localStorage.getItem(COUNTER_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
};

const saveCounter = (v: number) => {
  try {
    localStorage.setItem(COUNTER_KEY, String(v));
  } catch {
    // 保存できなくても番号が戻るだけ。
  }
};

let counter = loadCounter();

export const resetCounter = () => {
  counter = 0;
  saveCounter(0);
};

export interface TrackEvents {
  onJoin: (t: Track) => void;
  onLeave: (t: Track) => void;
}

export const createTracker = (events: TrackEvents) => {
  const tracks: Track[] = [];

  const update = (bodies: Body[], now: number) => {
    const free = new Set(tracks);
    for (const body of bodies) {
      const [cx, cy] = centerOf(body);
      let best: Track | undefined;
      let bestD = MATCH_DISTANCE;
      for (const t of free) {
        const [tx, ty] = centerOf(t.body);
        const d = Math.hypot(cx - tx, cy - ty);
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      }
      if (best) {
        free.delete(best);
        smooth(best.body, body, SMOOTHING);
        best.seenAt = now;
        continue;
      }
      counter += 1;
      saveCounter(counter);
      const t: Track = {
        id: counter,
        body: createBody(),
        bornAt: now,
        seenAt: now,
        fitness: 0.42 + Math.random() * 0.55,
      };
      t.body.set(body);
      tracks.push(t);
      events.onJoin(t);
    }
    for (let i = tracks.length - 1; i >= 0; i--) {
      const t = tracks[i];
      if (t && now - t.seenAt > LOST_AFTER_MS) {
        tracks.splice(i, 1);
        events.onLeave(t);
      }
    }
  };

  return {tracks, update};
};
