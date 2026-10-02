import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { skyAt } from '../src/sky';
import { wxKind, wxLabel } from '../src/weather';
import { snapToTrail, type TrailPt } from '../supabase/functions/_shared/trail';

const { pts, totalKm } = JSON.parse(fs.readFileSync('public/data/trail.json', 'utf8')) as { pts: TrailPt[]; totalKm: number };
const poi = JSON.parse(fs.readFileSync('public/data/poi.json', 'utf8')).pts as { id: string; title: string; text: string; km: number }[];
const input = JSON.parse(fs.readFileSync('scripts/poi-input.json', 'utf8')) as { id: string; lat?: number; lon?: number; km?: number }[];

describe('poi.json', () => {
  it('has enough points, sorted along the trail', () => {
    expect(poi.length).toBeGreaterThanOrEqual(35);
    for (let i = 1; i < poi.length; i++) expect(poi[i].km).toBeGreaterThanOrEqual(poi[i - 1].km);
    for (const p of poi) { expect(p.km).toBeGreaterThanOrEqual(0); expect(p.km).toBeLessThanOrEqual(totalKm + 1); }
  });
  it('has unique ids, a title and 1 to 3 sentences without a middle dot', () => {
    expect(new Set(poi.map(p => p.id)).size).toBe(poi.length);
    for (const p of poi) {
      expect(p.title.length).toBeGreaterThan(1);
      expect(p.text).not.toMatch(/·/);
      expect(p.text.length).toBeGreaterThan(30);
      expect(p.text.length).toBeLessThan(330);
    }
  });
  it('is up to date with its input (km is the snap of the coordinates)', () => {
    for (const i of input) {
      if (i.lat === undefined) continue;
      const p = poi.find(x => x.id === i.id)!;
      expect(Math.abs(snapToTrail(pts, i.lon!, i.lat).km - p.km)).toBeLessThan(.11);
    }
  });
  it('publishes no coordinates', () => { for (const p of poi) expect(Object.keys(p).sort()).toEqual(['id', 'km', 'text', 'title']); });
});

describe('sky', () => {
  const alpha = (h: number) => +skyAt(h).match(/,([\d.]+)\)$/)![1];
  it('is dark at night, clear by day, tinted at dawn and golden hour', () => {
    expect(alpha(2)).toBeGreaterThan(.3);
    expect(alpha(12)).toBe(0);
    expect(alpha(6.2)).toBeGreaterThan(.1);
    expect(alpha(17.6)).toBeGreaterThan(.15);
    expect(alpha(21)).toBeGreaterThan(.3);
  });
  it('is continuous across midnight', () => { expect(skyAt(0)).toBe(skyAt(24)); });
});

describe('weather', () => {
  it('maps codes to effects and Hebrew labels', () => {
    expect(wxKind(0)).toBe('clear'); expect(wxKind(3)).toBe('cloud'); expect(wxKind(61)).toBe('rain'); expect(wxKind(81)).toBe('rain');
    expect(wxKind(73)).toBe('snow'); expect(wxKind(95)).toBe('storm'); expect(wxKind(45)).toBe('fog');
    expect(wxLabel(0, true)).toBe('שמשי'); expect(wxLabel(0, false)).toBe('בהיר'); expect(wxLabel(63, true)).toBe('גשם');
  });
});
