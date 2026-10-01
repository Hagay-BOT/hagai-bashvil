import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { snapToTrail, pointAtKm, displayKm, stageAtKm, israelHour, type TrailPt, type PublicState, type Stage } from '../supabase/functions/_shared/trail';

const { pts, totalKm } = JSON.parse(fs.readFileSync('public/data/trail.json', 'utf8')) as { pts: TrailPt[]; totalKm: number };
const { stages } = JSON.parse(fs.readFileSync('public/data/stages.json', 'utf8')) as { stages: Stage[] };

describe('snapToTrail', () => {
  it('snaps the trailhead to km 0', () => {
    const r = snapToTrail(pts, pts[0][0], pts[0][1]);
    expect(r.km).toBeLessThan(0.05);
    expect(r.distM).toBeLessThan(5);
  });
  it('snaps the end to the total length', () => {
    const e = pts[pts.length - 1];
    expect(snapToTrail(pts, e[0], e[1]).km).toBeCloseTo(totalKm, 0);
  });
  it('is the inverse of pointAtKm along the trail', () => {
    for (const km of [12.3, 57.1, 231.3, 358.2, 629.2, 837.7, 1050]) {
      const [lon, lat] = pointAtKm(pts, km);
      const r = snapToTrail(pts, lon, lat, km);
      expect(Math.abs(r.km - km)).toBeLessThan(0.3);
      expect(r.distM).toBeLessThan(30);
    }
  });
  it('places known towns near the planned km', () => {
    // Arad centre is the end of stage 32 (629 km); Mitzpe Ramon the end of stage 44 (838 km)
    const arad = snapToTrail(pts, 35.2126, 31.2589);
    expect(Math.abs(arad.km - 629.2)).toBeLessThan(8);
    const ramon = snapToTrail(pts, 34.8013, 30.6094);
    expect(Math.abs(ramon.km - 837.7)).toBeLessThan(8);
  });
  it('snaps an off-trail point onto the line and reports the offset', () => {
    const [lon, lat] = pointAtKm(pts, 100);
    const r = snapToTrail(pts, lon + 0.02, lat, 100); // ~1.9 km east
    expect(r.distM).toBeGreaterThan(200); // the trail winds, so the nearest stretch may be closer than the offset
    expect(Math.abs(r.km - 100)).toBeLessThan(4);
  });
});

describe('displayKm', () => {
  const base: PublicState = { km: 100, at: '2026-10-10T07:00:00Z', pace: 3, capKm: 110, status: 'walking', dayNo: 6 };
  const t = (iso: string) => Date.parse(iso);
  it('shows a fresh fix as-is', () => {
    const r = displayKm(base, t('2026-10-10T07:10:00Z'));
    expect(r.km).toBe(100);
    expect(r.estimated).toBe(false);
  });
  it('extrapolates a stale fix at the recent pace', () => {
    const r = displayKm(base, t('2026-10-10T09:00:00Z')); // 2 h later, 10:00–12:00 local
    expect(r.estimated).toBe(true);
    expect(r.km).toBeGreaterThan(105);
    expect(r.km).toBeLessThanOrEqual(106.1);
  });
  it('never passes the end of the day stage', () => {
    expect(displayKm(base, t('2026-10-10T13:00:00Z')).km).toBe(110);
  });
  it('does not move at night', () => {
    const night: PublicState = { ...base, at: '2026-10-10T17:00:00Z' }; // 20:00 local
    expect(displayKm(night, t('2026-10-10T22:00:00Z')).km).toBe(100);
  });
  it('does not move when not walking', () => {
    for (const status of ['break', 'camp', 'rest', 'hidden'] as const) {
      expect(displayKm({ ...base, status }, t('2026-10-10T10:00:00Z')).km).toBe(100);
    }
  });
});

describe('stages', () => {
  it('has 57 stages that tile the trail', () => {
    expect(stages.length).toBe(57);
    expect(stages[0].kmStart).toBe(0);
    for (let i = 1; i < stages.length; i++) expect(stages[i].kmStart).toBe(stages[i - 1].kmEnd);
  });
  it('finds the stage for a km', () => {
    expect(stageAtKm(stages, 0).n).toBe(1);
    expect(stageAtKm(stages, 57.0).n).toBe(3);
    expect(stageAtKm(stages, 99999).n).toBe(57);
  });
});

describe('israelHour', () => {
  it('converts UTC to Israel local time', () => {
    expect(israelHour(Date.parse('2026-10-10T07:00:00Z'))).toBeCloseTo(10, 1); // IDT, UTC+3
    expect(israelHour(Date.parse('2026-12-01T07:00:00Z'))).toBeCloseTo(9, 1);  // IST, UTC+2
  });
});
