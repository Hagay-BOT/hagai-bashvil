import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { computeState, dayNo, parseBody, recentPace, CAMP_BACKOFF_MIN, type Fix } from '../supabase/functions/_shared/state';
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
  it('freezes everything while hidden', () => {
    const fixes = walk('2026-10-07T05:00:00Z', 40, 120);
    const prev = computeState(fixes.slice(0, 4), fixes[3].at, stages, START, null, null);
    const s = computeState(fixes, fixes.at(-1)!.at, stages, START, 'hidden', prev);
    expect(s.status).toBe('hidden');
    expect(s.km).toBe(prev.km);
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
