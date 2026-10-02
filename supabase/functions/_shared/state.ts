// Pure logic that turns recent snapped fixes into the public state. No I/O, tested with vitest.
import { israelHour, stageAtKm, STALE_MIN, type PublicState, type Stage, type Status } from './trail.ts';

export interface Fix { at: number; km: number }   // ms epoch, km on the trail

export const CAMP_BACKOFF_MIN = 45;   // the camp is shown where he was this long before stopping
const BREAK_AFTER_MIN = 20;
const CAMP_AFTER_MIN = 60;            // after noon, an hour without moving counts as the night stop
const NOON_H = 12;
const NIGHT_FROM_H = 17, NIGHT_TO_H = 9;   // any stop in this window counts as the night stop
const MOVING_KM = 0.15;
const MIN_BACKOFF_KM = 1;             // the hidden position is never closer than this to where he stopped
const FALLBACK_BACKOFF_KM = 2.25;     // 45 minutes at 3 km/h, when no older fix is known
export const FINISH_KM = 1080;        // Eilat
export const FINISH_STOP_KM = 1080.5; // the public figure never moves past this
export const MAX_KMH = 8;             // faster than this along the trail is a GPS jump or a ride
export const CAMP_CLEAR_KM = 0.3;     // a manual "done for today" clears once he moved this far

/** Day number of the journey for a moment in time (1 on the start date, 0 before it). */
export function dayNo(nowMs: number, startDate: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' });
  const today = Date.parse(fmt.format(new Date(nowMs)) + 'T00:00:00Z');
  const start = Date.parse(startDate + 'T00:00:00Z');
  const d = Math.round((today - start) / 86400000) + 1;
  return d < 1 ? 0 : d;
}

/** Israel calendar date (YYYY-MM-DD) of a moment. */
export function israelDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(ms));
}

/** Offset of Israel time from UTC at a moment, in ms (+2 h in winter, +3 h in summer). */
function israelOffsetMs(ms: number): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find(x => x.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ms / 1000) * 1000;
}

/** The UTC moment of local midnight starting an Israel date (YYYY-MM-DD). */
export function israelMidnightMs(date: string): number {
  const guess = Date.parse(date + 'T00:00:00Z');
  const t = guess - israelOffsetMs(guess);
  return guess - israelOffsetMs(t);
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

/** True when going from `a` to `b` along the trail is possible on foot (GPS noise allowed). */
export function plausible(a: Fix, b: Fix): boolean {
  return Math.abs(b.km - a.km) <= 0.3 + MAX_KMH * Math.abs(b.at - a.at) / 3600000;
}

/**
 * Outlier filter for incoming fixes. `st.last` is the last accepted fix, `st.pending` the rejected ones since.
 * A fix that implies more than MAX_KMH is rejected, unless at least two earlier rejected fixes over 10+ minutes
 * agree with it (a real move, such as a ride to skip a section). Mutates `st`.
 */
export function acceptFix(st: { last?: Fix; pending: Fix[] }, f: Fix): boolean {
  if (!st.last || plausible(st.last, f)) { st.last = f; st.pending = []; return true; }
  const agree = st.pending.filter(p => Math.abs(p.km - f.km) <= 1 && f.at - p.at <= 2 * 3600000 && f.at > p.at);
  if (agree.length >= 2 && f.at - agree[0].at >= 10 * 60000) { st.last = f; st.pending = []; return true; }
  st.pending.push(f);
  return false;
}

/** A forgotten rest day ends by itself at 06:00 the next local morning. */
export function restExpired(setAtMs: number, nowMs: number): boolean {
  return israelDate(nowMs) > israelDate(setAtMs) && israelHour(nowMs) >= 6;
}

/** Where to show him while the place he stopped must stay private. */
function hiddenSpot(fixes: Fix[], stopAt: number, prev: PublicState | null): { km: number; at: number } {
  const last = fixes[fixes.length - 1];
  const cutoff = stopAt - CAMP_BACKOFF_MIN * 60000;
  const earlier = [...fixes].reverse().find(f => f.at <= cutoff);
  let km: number, at: number;
  if (earlier) { km = earlier.km; at = earlier.at; }
  else if (prev && ['camp', 'rest', 'nosignal'].includes(prev.status) && prev.km <= last.km - MIN_BACKOFF_KM && prev.km >= last.km - 5) { km = prev.km; at = Date.parse(prev.at); }
  else { km = last.km - FALLBACK_BACKOFF_KM; at = cutoff; }
  km = Math.max(0, Math.min(km, last.km - MIN_BACKOFF_KM));
  return { km, at: Math.min(at, cutoff) };
}

/**
 * Computes what visitors may see.
 * `fixes` are snapped fixes sorted by time (oldest first), as many recent ones as available.
 * `manual` is what the admin page asked for: 'camp' (done for today), 'rest' (rest day), 'hidden', or null.
 */
export function computeState(fixes: Fix[], nowMs: number, stages: Stage[], startDate: string, manual: 'camp' | 'rest' | 'hidden' | null, prev: PublicState | null): PublicState {
  const day = dayNo(nowMs, startDate);
  // before the start nothing is published, wherever the phone is
  if (day === 0) return { km: 0, at: new Date(nowMs).toISOString(), pace: 3, capKm: stages[0].kmEnd, status: 'before', dayNo: 0 };
  // reached Eilat: the figure stays there for good, wherever the phone goes next
  if (prev?.status === 'finished') return { ...prev, dayNo: day };
  if (!fixes.length) {
    return prev ? { ...prev, dayNo: day } : { km: 0, at: new Date(nowMs).toISOString(), pace: 3, capKm: 0, status: 'before', dayNo: day };
  }
  if (manual === 'hidden' && prev) return { ...prev, status: 'hidden', dayNo: day };

  const last = fixes[fixes.length - 1];
  const pace = recentPace(fixes);
  if (last.km >= FINISH_KM) {
    return { km: +Math.min(last.km, FINISH_STOP_KM).toFixed(2), at: new Date(last.at).toISOString(), pace: +pace.toFixed(2), capKm: FINISH_STOP_KM, status: 'finished', dayNo: day };
  }
  // when he last actually moved; the time since then counts up to now, also when the phone stops sending
  let movedAt = fixes[0].at;
  for (let i = fixes.length - 1; i > 0; i--) {
    if (Math.abs(last.km - fixes[i - 1].km) > MOVING_KM) { movedAt = fixes[i].at; break; }
  }
  const stillMin = (nowMs - movedAt) / 60000;
  const ageMin = (nowMs - last.at) / 60000;
  const hour = israelHour(nowMs);
  const night = hour >= NIGHT_FROM_H || hour < NIGHT_TO_H;

  let status: Status = 'walking';
  if (manual === 'rest') status = 'rest';
  else if (manual === 'camp') status = 'camp';
  else if ((night && stillMin >= BREAK_AFTER_MIN) || (hour >= NOON_H && stillMin >= CAMP_AFTER_MIN)) status = 'camp';
  else if (ageMin > STALE_MIN) status = night ? 'camp' : 'nosignal';
  else if (stillMin >= BREAK_AFTER_MIN) status = 'break';

  let km = last.km, at = last.at;
  // a stop after noon may turn out to be the night stop, so it is never shown exactly
  if (status === 'camp' || status === 'rest' || status === 'nosignal' || (status === 'break' && hour >= NOON_H)) {
    ({ km, at } = hiddenSpot(fixes, movedAt, prev));
  }
  const stage = stageAtKm(stages, last.km + 0.2);
  // the last 3 km before the planned end of the day: shown 25 min late, so the moment he
  // arrives at the night stop (before it is detected as a stop) is never shown exactly
  if (status === 'walking' && last.km > stage.kmEnd - 3) {
    const earlier = [...fixes].reverse().find(f => f.at <= last.at - 25 * 60000);
    if (earlier) { km = earlier.km; at = earlier.at; }
  }
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
