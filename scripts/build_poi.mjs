// Builds public/data/poi.json: snaps every point of interest to the trail and writes its km.
// Input: scripts/poi-input.json (title, text, and either {lat, lon} or {km}).
// Run: node scripts/build_poi.mjs
import fs from 'node:fs';
import { snapToTrail } from '../supabase/functions/_shared/trail.ts';

const trail = JSON.parse(fs.readFileSync('public/data/trail.json', 'utf8'));
const input = JSON.parse(fs.readFileSync('scripts/poi-input.json', 'utf8'));
const out = [];
for (const p of input) {
  let km = p.km, off = 0;
  if (km === undefined) { const r = snapToTrail(trail.pts, p.lon, p.lat); km = r.km; off = r.distM; }
  if (off > 6000) console.warn(`far from the trail: ${p.id} ${off} m`);
  out.push({ id: p.id, title: p.title, text: p.text, km: Math.round(km * 10) / 10 });
}
out.sort((a, b) => a.km - b.km);
fs.writeFileSync('public/data/poi.json', JSON.stringify({ pts: out }, null, 1) + '\n');
console.log(out.length, 'points');
for (const p of out) console.log(String(p.km).padStart(7), "", p.title);
