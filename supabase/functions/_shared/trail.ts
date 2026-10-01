// Trail math shared by the site (Vite) and the ingest function (Deno). No dependencies.
// A trail is an ordered list of [lon, lat, km] points, north to south.

export type TrailPt = [number, number, number];

const RAD = Math.PI / 180;
const KM_PER_DEG = 111.195;

/** Nearest point on the trail to (lon, lat). Returns trail km and offset distance in metres.
 *  `hintKm` breaks ties where the trail runs close to itself: among candidates almost as near
 *  as the best one, the candidate closest to the hint wins. */
export function snapToTrail(pts: TrailPt[], lon: number, lat: number, hintKm?: number): { km: number; distM: number } {
  const kx = Math.cos(lat * RAD) * KM_PER_DEG;
  const ky = KM_PER_DEG;
  let bestD = Infinity;
  let bestKm = 0;
  const near: { d: number; km: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    // cheap reject: both ends farther than the best so far plus the segment length
    const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky;
    const bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, py = ay + dy * t;
    const d = Math.sqrt(px * px + py * py);
    if (d < bestD + 0.03) {
      const km = a[2] + (b[2] - a[2]) * t;
      if (hintKm !== undefined) near.push({ d, km });
      if (d < bestD) { bestD = d; bestKm = km; }
    }
  }
  if (hintKm !== undefined) {
    let pick = bestKm, pickGap = Math.abs(bestKm - hintKm);
    for (const c of near) {
      if (c.d <= bestD + 0.03 && Math.abs(c.km - hintKm) < pickGap) { pick = c.km; pickGap = Math.abs(c.km - hintKm); }
    }
    bestKm = pick;
  }
  return { km: bestKm, distM: Math.round(bestD * 1000) };
}

/** [lon, lat] of the trail at a given km (clamped to the trail). */
export function pointAtKm(pts: TrailPt[], km: number): [number, number] {
  if (km <= 0) return [pts[0][0], pts[0][1]];
  const last = pts[pts.length - 1];
  if (km >= last[2]) return [last[0], last[1]];
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][2] <= km) lo = mid; else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const t = (km - a[2]) / ((b[2] - a[2]) || 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export type Status = 'walking' | 'break' | 'camp' | 'rest' | 'hidden' | 'before';

/** What every visitor receives. Never contains raw coordinates. */
export interface PublicState {
  km: number;          // last real position, km on the trail
  at: string;          // ISO time of that position
  pace: number;        // recent average pace, km/h
  capKm: number;       // estimate never passes this (end of today's stage)
  status: Status;
  dayNo: number;       // day X of the journey (1-based), 0 before the start
}

const WALK_START_H = 6;
const WALK_END_H = 17.5;
const FRESH_MIN = 20;       // a fix younger than this is shown as-is
const MAX_EXTRAPOLATE_H = 5;

/** Local hour in Israel (handles DST through Intl). */
export function israelHour(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const h = Number(parts.find(p => p.type === 'hour')!.value);
  const m = Number(parts.find(p => p.type === 'minute')!.value);
  return (h % 24) + m / 60;
}

/** Position to display now. `estimated` is true when it is extrapolated from the last fix. */
export function displayKm(s: PublicState, nowMs: number): { km: number; estimated: boolean; ageMin: number } {
  const atMs = Date.parse(s.at);
  const ageMin = Math.max(0, (nowMs - atMs) / 60000);
  if (s.status !== 'walking' || ageMin <= FRESH_MIN) return { km: s.km, estimated: false, ageMin };
  // count only hours inside the walking window, sampled in 5-minute steps
  let walkedH = 0;
  for (let t = atMs; t < nowMs && walkedH < MAX_EXTRAPOLATE_H; t += 300000) {
    const h = israelHour(t);
    if (h >= WALK_START_H && h < WALK_END_H) walkedH += 5 / 60;
  }
  const pace = Math.min(Math.max(s.pace || 3, 1.5), 4.5);
  const km = Math.min(Math.max(s.capKm, s.km), s.km + pace * walkedH);
  return { km, estimated: km > s.km + 0.05, ageMin };
}

export interface Stage { n: number; from: string; to: string; km: number; hours: number | null; segs: string; kmStart: number; kmEnd: number; region: string; restAfter: boolean }

/** Stage that contains a given km (the last stage when past the end). */
export function stageAtKm(stages: Stage[], km: number): Stage {
  for (const s of stages) if (km < s.kmEnd) return s;
  return stages[stages.length - 1];
}
