import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { computeState, dayNo, parseBody, recentPace, acceptFix, restExpired, israelMidnightMs, CAMP_BACKOFF_MIN, type Fix } from '../supabase/functions/_shared/state';
import type { Stage } from '../supabase/functions/_shared/trail';

const { stages } = JSON.parse(fs.readFileSync('public/data/stages.json', 'utf8')) as { stages: Stage[] };
const START = '2026-10-05';
const T = (iso: string) => Date.parse(iso);
/** fixes every 10 minutes at 3 km/h starting at `km0` */
const walk = (startIso: string, km0: number, minutes: number): Fix[] =>
  Array.from({ length: minutes / 10 + 1 }, (_, i) => ({ at: T(startIso) + i * 600000, km: km0 + i * 0.5 }));

describe('dayNo', () => {
  it('counts from the start date in Israel time', () => {
    expect(dayNo(T('2026-10-04T12:00:00Z'), START)).toBe(0);
    expect(dayNo(T('2026-10-05T05:00:00Z'), START)).toBe(1);
    expect(dayNo(T('2026-10-05T21:30:00Z'), START)).toBe(2); // 00:30 local on the 6th
    expect(dayNo(T('2026-10-23T08:00:00Z'), START)).toBe(19);
  });
});

describe('computeState', () => {
  it('reports walking with the latest km and the stage end as cap', () => {
    const fixes = walk('2026-10-07T05:00:00Z', 40, 120);
    const s = computeState(fixes, fixes.at(-1)!.at, stages, START, null, null);
    expect(s.status).toBe('walking');
    expect(s.km).toBeCloseTo(46, 1);
    expect(s.capKm).toBe(57.1);
    expect(s.pace).toBeCloseTo(3, 1);
    expect(s.dayNo).toBe(3);
  });
  it('switches to a break after 20 still minutes in daytime', () => {
    const fixes = walk('2026-10-07T05:00:00Z', 40, 60);
    const end = fixes.at(-1)!;
    for (let i = 1; i <= 3; i++) fixes.push({ at: end.at + i * 600000, km: end.km + 0.01 });
    expect(computeState(fixes, fixes.at(-1)!.at, stages, START, null, null).status).toBe('break');
  });
  it('hides the camp: shows where he was 45 minutes before stopping', () => {
    const fixes = walk('2026-10-07T11:00:00Z', 48, 180);          // walks 14:00–17:00 local, ends at km 57
    const stop = fixes.at(-1)!;
    for (let i = 1; i <= 6; i++) fixes.push({ at: stop.at + i * 600000, km: stop.km }); // still until 18:00
    const s = computeState(fixes, fixes.at(-1)!.at, stages, START, null, null);
    expect(s.status).toBe('camp');
    expect(s.km).toBeLessThan(stop.km - 1.5);
    expect(Date.parse(s.at)).toBeLessThanOrEqual(stop.at - CAMP_BACKOFF_MIN * 60000 + 600000);
  });
  it('honours a manual "done for today"', () => {
    const fixes = walk('2026-10-07T08:00:00Z', 48, 120);
    const s = computeState(fixes, fixes.at(-1)!.at, stages, START, 'camp', null);
    expect(s.status).toBe('camp');
    expect(s.km).toBeLessThan(fixes.at(-1)!.km - 1.5);
  });
  it('shows a rest day without revealing where he sleeps', () => {
    const fixes = walk('2026-10-07T08:00:00Z', 48, 120);
    const s = computeState(fixes, fixes.at(-1)!.at, stages, START, 'rest', null);
    expect(s.status).toBe('rest');
    expect(s.km).toBeLessThan(fixes.at(-1)!.km - 1.5);
  });
  it('freezes everything while hidden', () => {
    const fixes = walk('2026-10-07T05:00:00Z', 40, 120);
    const prev = computeState(fixes.slice(0, 4), fixes[3].at, stages, START, null, null);
    const s = computeState(fixes, fixes.at(-1)!.at, stages, START, 'hidden', prev);
    expect(s.status).toBe('hidden');
    expect(s.km).toBe(prev.km);
  });
});

describe('before the start', () => {
  it('publishes nothing about the phone before day 1', () => {
    const fixes = walk('2026-10-03T08:00:00Z', 40, 60);
    const s = computeState(fixes, fixes.at(-1)!.at, stages, START, null, null);
    expect(s.status).toBe('before');
    expect(s.km).toBe(0);
  });
});

describe('recentPace', () => {
  it('clamps to walking speeds', () => {
    expect(recentPace([{ at: 0, km: 0 }, { at: 3600000, km: 30 }])).toBe(4.5);   // a car ride
    expect(recentPace([{ at: 0, km: 0 }, { at: 3600000, km: 0.2 }])).toBe(1.5);
  });
});

describe('parseBody', () => {
  const now = new Date().toISOString();
  it('reads an Overland batch', () => {
    const r = parseBody({ locations: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [35.5, 33.0] }, properties: { timestamp: now, horizontal_accuracy: 8 } }] });
    expect(r).toHaveLength(1);
    expect(r[0].src).toBe('overland');
  });
  it('reads OwnTracks and a manual check-in', () => {
    expect(parseBody({ _type: 'location', lat: 33, lon: 35.5, tst: Math.floor(Date.now() / 1000), acc: 10 })).toHaveLength(1);
    expect(parseBody({ type: 'checkin', lat: 33, lon: 35.5 })[0].src).toBe('checkin');
  });
  it('drops inaccurate, out-of-area and malformed points', () => {
    expect(parseBody({ locations: [{ geometry: { coordinates: [35.5, 33.0] }, properties: { timestamp: now, horizontal_accuracy: 900 } }] })).toHaveLength(0);
    expect(parseBody({ type: 'checkin', lat: 48.8, lon: 2.3 })).toHaveLength(0);
    expect(parseBody({ hello: 1 })).toHaveLength(0);
    expect(parseBody(null)).toHaveLength(0);
  });
});

/** walks from `startIso` to `km0 + 0.5 * minutes / 10`, then stands still with a fix every 10 minutes for `stillMin` */
const walkThenStay = (startIso: string, km0: number, minutes: number, stillMin: number): Fix[] => {
  const f = walk(startIso, km0, minutes), end = f.at(-1)!;
  for (let i = 1; i <= stillMin / 10; i++) f.push({ at: end.at + i * 600000, km: end.km + (i % 2 ? 0.02 : -0.02) });
  return f;
};
const M = 60000;

describe('the night stop stays private', () => {
  it('a stop after noon is hidden from the first break, and becomes the camp after an hour', () => {
    const f = walkThenStay('2026-10-07T09:00:00Z', 40, 180, 30);   // walks 12:00–15:00 local, stays until 15:30
    const stop = f[18];
    const brk = computeState(f, f.at(-1)!.at, stages, START, null, null);
    expect(brk.status).toBe('break');
    expect(brk.km).toBeLessThanOrEqual(stop.km - 1);
    const g = walkThenStay('2026-10-07T09:00:00Z', 40, 180, 70);   // stays until 16:10
    const camp = computeState(g, g.at(-1)!.at, stages, START, null, null);
    expect(camp.status).toBe('camp');
    expect(camp.km).toBeLessThanOrEqual(stop.km - 1);
  });
  it('arriving before 17:00 with the phone silent is the camp once evening comes', () => {
    const f = walk('2026-10-07T11:00:00Z', 48, 110);               // 14:00–15:50 local, then no more fixes
    const s = computeState(f, T('2026-10-07T14:15:00Z'), stages, START, null, null);  // 17:15 local
    expect(s.status).toBe('camp');
    expect(s.km).toBeLessThanOrEqual(f.at(-1)!.km - 1);
  });
  it('any stop between 17:00 and 09:00 is the camp, not a break', () => {
    const f = walkThenStay('2026-10-07T13:00:00Z', 48, 60, 20);    // 16:00–17:00 local, still until 17:20
    const s = computeState(f, f.at(-1)!.at, stages, START, null, null);
    expect(s.status).toBe('camp');
    expect(s.km).toBeLessThanOrEqual(f.at(-1)!.km - 1);
  });
  it('after midnight, with only still fixes left, never shows the camp itself', () => {
    const f: Fix[] = Array.from({ length: 30 }, (_, i) => ({ at: T('2026-10-07T21:00:00Z') + i * 600000, km: 57 + (i % 2) * 0.03 }));
    const s = computeState(f, f.at(-1)!.at, stages, START, null, null);
    expect(s.status).toBe('camp');
    expect(s.km).toBeLessThanOrEqual(56);
    const prev = { ...s, km: 55.1 };
    expect(computeState(f, f.at(-1)!.at, stages, START, null, prev).km).toBe(55.1);   // stays where it was shown
  });
  it('a "done for today" pressed hours after arriving still hides the camp', () => {
    const f = walkThenStay('2026-10-07T08:00:00Z', 48, 120, 180);  // arrives 13:00 local, presses at 16:00
    const s = computeState(f, f.at(-1)!.at, stages, START, 'camp', null);
    expect(s.status).toBe('camp');
    expect(s.km).toBeLessThanOrEqual(f[12].km - 1);
  });
  it('in the morning he walks again and is shown as he is', () => {
    const f = walk('2026-10-08T04:00:00Z', 57, 60);                // 07:00–08:00 local
    expect(computeState(f, f.at(-1)!.at, stages, START, null, null).status).toBe('walking');
  });
});

describe('no signal', () => {
  it('a fix older than an hour in daytime is "no signal", shown away from the last fix', () => {
    const f = walk('2026-10-07T05:00:00Z', 40, 120);               // ends 10:00 local
    const s = computeState(f, f.at(-1)!.at + 70 * M, stages, START, null, null);
    expect(s.status).toBe('nosignal');
    expect(s.km).toBeLessThanOrEqual(f.at(-1)!.km - 1);
  });
  it('is never "walking" with one old fix', () => {
    const s = computeState([{ at: T('2026-10-07T05:00:00Z'), km: 40 }], T('2026-10-07T07:00:00Z'), stages, START, null, null);
    expect(s.status).not.toBe('walking');
    expect(s.km).toBeLessThanOrEqual(39);
  });
});

describe('Eilat', () => {
  it('finishes at km 1080 and the figure stops there for good', () => {
    const f = walk('2026-12-10T08:00:00Z', 1078, 60);
    const s = computeState(f, f.at(-1)!.at, stages, START, null, null);
    expect(s.status).toBe('finished');
    expect(s.km).toBeLessThanOrEqual(1080.5);
    const later = computeState([{ at: f.at(-1)!.at + 3600000, km: 1040 }], f.at(-1)!.at + 3600000, stages, START, null, s);
    expect(later.status).toBe('finished');
    expect(later.km).toBe(s.km);
  });
});

describe('acceptFix', () => {
  it('rejects a GPS jump faster than 8 km/h and keeps walking fixes', () => {
    const st: { last?: Fix; pending: Fix[] } = { pending: [] };
    expect(acceptFix(st, { at: 0, km: 10 })).toBe(true);
    expect(acceptFix(st, { at: 10 * M, km: 10.5 })).toBe(true);
    expect(acceptFix(st, { at: 20 * M, km: 25 })).toBe(false);
    expect(acceptFix(st, { at: 30 * M, km: 11.4 })).toBe(true);
    expect(acceptFix(st, { at: 30 * M + 5000, km: 11.6 })).toBe(true);    // GPS noise within seconds
  });
  it('accepts a real move once three fixes over 10 minutes agree', () => {
    const st: { last?: Fix; pending: Fix[] } = { pending: [], last: { at: 0, km: 100 } };
    expect(acceptFix(st, { at: 30 * M, km: 140 })).toBe(false);
    expect(acceptFix(st, { at: 35 * M, km: 140.1 })).toBe(false);
    expect(acceptFix(st, { at: 42 * M, km: 140.3 })).toBe(true);
  });
});

describe('time in Israel', () => {
  it('finds local midnight across the switch to winter time on 25.10.2026', () => {
    expect(new Date(israelMidnightMs('2026-10-10')).toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(new Date(israelMidnightMs('2026-10-25')).toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(new Date(israelMidnightMs('2026-10-26')).toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });
  it('ends a forgotten rest day at 06:00 the next morning', () => {
    expect(restExpired(T('2026-10-10T05:00:00Z'), T('2026-10-10T18:00:00Z'))).toBe(false);
    expect(restExpired(T('2026-10-10T05:00:00Z'), T('2026-10-11T02:30:00Z'))).toBe(false);   // 05:30 local
    expect(restExpired(T('2026-10-10T05:00:00Z'), T('2026-10-11T03:05:00Z'))).toBe(true);    // 06:05 local
  });
});
