// Pure logic that turns recent snapped fixes into the public state. No I/O, tested with vitest.
import { israelHour, stageAtKm, type PublicState, type Stage, type Status } from './trail.ts';

export interface Fix { at: number; km: number }   // ms epoch, km on the trail

export const CAMP_BACKOFF_MIN = 45;   // the camp is shown where he was this long before stopping
const BREAK_AFTER_MIN = 20;
const CAMP_AFTER_MIN = 40;
const EVENING_H = 17.5;
const MOVING_KM = 0.15;

/** Day number of the journey for a moment in time (1 on the start date, 0 before it). */
export function dayNo(nowMs: number, startDate: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' });
  const today = Date.parse(fmt.format(new Date(nowMs)) + 'T00:00:00Z');
  const start = Date.parse(startDate + 'T00:00:00Z');
  const d = Math.round((today - start) / 86400000) + 1;
  return d < 1 ? 0 : d;
}

/** Recent average pace in km/h over the last 90 minutes of fixes, clamped to walking speeds. */
export function recentPace(fixes: Fix[]): number {
  if (fixes.length < 2) return 3;
  const last = fixes[fixes.length - 1];
  const first = fixes.find(f => last.at - f.at <= 90 * 60000) ?? fixes[0];
  const h = (last.at - first.at) / 3600000;
  if (h < 0.15) return 3;
  return Math.min(4.5, Math.max(1.5, Math.abs(last.km - first.km) / h));
}

/**
 * Computes what visitors may see.
 * `fixes` are snapped fixes sorted by time (oldest first), at least the last few hours.
 * `manual` is what the admin page asked for: 'camp' (done for today), 'hidden', or null.
 */
export function computeState(fixes: Fix[], nowMs: number, stages: Stage[], startDate: string, manual: 'camp' | 'hidden' | null, prev: PublicState | null): PublicState {
  const day = dayNo(nowMs, startDate);
  if (!fixes.length) {
    return prev ?? { km: 0, at: new Date(nowMs).toISOString(), pace: 3, capKm: 0, status: 'before', dayNo: day };
  }
  if (manual === 'hidden' && prev) return { ...prev, status: 'hidden', dayNo: day };

  const last = fixes[fixes.length - 1];
  const pace = recentPace(fixes);
  // how long since he last actually moved
  let movedAt = fixes[0].at;
  for (let i = fixes.length - 1; i > 0; i--) {
    if (Math.abs(last.km - fixes[i - 1].km) > MOVING_KM) { movedAt = fixes[i].at; break; }
  }
  const stillMin = (last.at - movedAt) / 60000;
  const hour = israelHour(last.at);

  let status: Status = 'walking';
  if (manual === 'camp' || (hour >= EVENING_H && stillMin >= CAMP_AFTER_MIN)) status = 'camp';
  else if (stillMin >= BREAK_AFTER_MIN) status = 'break';

  let km = last.km, at = last.at;
  if (status === 'camp') {
    // show the position from CAMP_BACKOFF_MIN before he stopped, so the camp itself stays private
    const stopAt = manual === 'camp' ? last.at : movedAt;
    const cutoff = stopAt - CAMP_BACKOFF_MIN * 60000;
    const earlier = [...fixes].reverse().find(f => f.at <= cutoff);
    if (earlier) { km = earlier.km; at = earlier.at; }
    else { km = Math.min(...fixes.map(f => f.km)); at = fixes[0].at; }
  }
  const stage = stageAtKm(stages, last.km + 0.2);
  return { km: +km.toFixed(2), at: new Date(at).toISOString(), pace: +pace.toFixed(2), capKm: stage.kmEnd, status, dayNo: day };
}

/** Parses the bodies we accept into plain fixes: Overland batch, OwnTracks, or a manual check-in. */
export function parseBody(body: unknown): { lon: number; lat: number; at: number; acc: number | null; src: string }[] {
  const out: { lon: number; lat: number; at: number; acc: number | null; src: string }[] = [];
  const b = body as Record<string, unknown>;
  if (b && Array.isArray(b.locations)) {
    for (const l of b.locations as Record<string, any>[]) {
      const c = l?.geometry?.coordinates;
      const t = Date.parse(l?.properties?.timestamp);
      if (Array.isArray(c) && isFinite(c[0]) && isFinite(c[1]) && isFinite(t)) {
        out.push({ lon: +c[0], lat: +c[1], at: t, acc: isFinite(l.properties.horizontal_accuracy) ? +l.properties.horizontal_accuracy : null, src: 'overland' });
      }
    }
  } else if (b && b._type === 'location' && isFinite(b.lat as number) && isFinite(b.lon as number)) {
    out.push({ lon: +(b.lon as number), lat: +(b.lat as number), at: (+(b.tst as number) || Date.now() / 1000) * 1000, acc: isFinite(b.acc as number) ? +(b.acc as number) : null, src: 'owntracks' });
  } else if (b && b.type === 'checkin' && isFinite(b.lat as number) && isFinite(b.lon as number)) {
    out.push({ lon: +(b.lon as number), lat: +(b.lat as number), at: Date.now(), acc: isFinite(b.acc as number) ? +(b.acc as number) : null, src: 'checkin' });
  }
  // sanity: inside the map area, not from the future, accurate enough
  return out.filter(f => f.lon > 34 && f.lon < 36.2 && f.lat > 29.3 && f.lat < 33.6 && f.at < Date.now() + 600000 && (f.acc === null || f.acc <= 150));
}
