import {type BodyFilter, createFilter, step} from "./filter";
import {type Body, centerOf} from "./skeleton";

export interface Track {
  filter: BodyFilter;
  bornAt: number;
  seenAt: number;
}

export const bodyOf = (t: Track): Body => t.filter.value;

const MATCH_DISTANCE = 0.18;
export const LOST_AFTER_MS = 600;

export const createTracker = () => {
  const tracks: Track[] = [];

  const update = (bodies: Body[], now: number) => {
    const free = new Set(tracks);
    for (const body of bodies) {
      const [cx, cy] = centerOf(body);
      let best: Track | undefined;
      let bestD = MATCH_DISTANCE;
      for (const t of free) {
        const [tx, ty] = centerOf(bodyOf(t));
        const d = Math.hypot(cx - tx, cy - ty);
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      }
      if (best) {
        free.delete(best);
        step(best.filter, body, now);
        best.seenAt = now;
        continue;
      }
      tracks.push({filter: createFilter(body, now), bornAt: now, seenAt: now});
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
