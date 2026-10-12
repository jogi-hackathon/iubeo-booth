import {type Body, centerOf, createBody, smooth} from "./skeleton";

export interface Track {
  body: Body;
  bornAt: number;
  seenAt: number;
}

const MATCH_DISTANCE = 0.18;
export const LOST_AFTER_MS = 600;
const SMOOTHING = 0.55;

export const createTracker = () => {
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
      const t: Track = {body: createBody(), bornAt: now, seenAt: now};
      t.body.set(body);
      tracks.push(t);
    }
    for (let i = tracks.length - 1; i >= 0; i--) {
      const t = tracks[i];
      if (t && now - t.seenAt > LOST_AFTER_MS) {
        tracks.splice(i, 1);
      }
    }
  };

  return {tracks, update};
};
