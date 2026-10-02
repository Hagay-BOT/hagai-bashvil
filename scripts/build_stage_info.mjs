// What each planned stage passes: named peaks, streams, springs, ruins and lakes near the trail, from the
// OpenStreetMap extracts the close-up tiles were built from (data-raw/osm-*.json, (c) OpenStreetMap contributors, ODbL).
// No towns or villages: the stages end where Hagai sleeps, and those names stay private until he has passed them.
//   node scripts/build_stage_info.mjs  ->  public/data/stage-info.json  { "1": "…", … }
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const trail = JSON.parse(readFileSync('public/data/trail.json')).pts;   // [lon, lat, km]
const { stages } = JSON.parse(readFileSync('public/data/stages.json'));
const R = 6371, rad = Math.PI / 180;
const xy = (lon, lat) => [lon * rad * R * Math.cos(31.4 * rad), lat * rad * R];
const T = trail.map(p => [...xy(p[0], p[1]), p[2]]);

// named features, one entry per name and kind (a stream is many ways with one name)
const feats = new Map();
for (const f of readdirSync('data-raw').filter(f => /^osm-.*\.json$/.test(f))) {
  for (const e of JSON.parse(readFileSync('data-raw/' + f))) {
    const g = e.tags || {}, name = (g['name:he'] || g.name || '').replace(/[֑-ׇ]/g, '').trim();
    if (!name || !/[֐-׿]/.test(name) || g.place) continue;
    const kind = g.natural === 'peak' ? 'peak' : g.natural === 'spring' ? 'spring'
      : (g.waterway === 'stream' || g.waterway === 'river') ? 'stream'
      : g.historic === 'archaeological_site' || g.historic === 'ruins' ? 'ruin'
      : g.natural === 'water' && /^(אגם|ים |הכנרת|כנרת)/.test(name) ? 'lake' : '';
    if (kind === 'spring' && !/^(עין|עינות|מעיין|באר)/.test(name)) continue;
    if (!kind) continue;
    const pts = e.geometry ? e.geometry.map(p => xy(p.lon, p.lat)) : e.lat != null ? [xy(e.lon, e.lat)] : [];
    if (!pts.length) continue;
    const key = kind + '|' + name, o = feats.get(key) ?? { kind, name, ele: +g.ele || 0, pts: [] };
    o.pts.push(...pts); feats.set(key, o);
  }
}
const all = [...feats.values()];
const fmt = n => new Intl.NumberFormat('he-IL').format(Math.round(Math.abs(n)));
const ele = n => n < 0 ? `${fmt(n)} מ' מתחת לפני הים` : `${fmt(n)} מ'`;
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' ו' + a[a.length - 1];

const out = {};
for (const s of stages) {
  const seg = T.filter(p => p[2] >= s.kmStart && p[2] <= s.kmEnd);
  const x0 = Math.min(...seg.map(p => p[0])) - 1, x1 = Math.max(...seg.map(p => p[0])) + 1, y0 = Math.min(...seg.map(p => p[1])) - 1, y1 = Math.max(...seg.map(p => p[1])) + 1;
  const near = [];
  for (const f of all) {
    const fp = f.pts.filter(p => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1);
    if (!fp.length) continue;
    let best = 1e9, km = 0, along = 0;
    for (const p of seg) {
      let d = 1e9; for (const q of fp) { const dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (dd < d) d = dd; }
      if (d < best) { best = d; km = p[2]; }
      if (d < .12) along++;
    }
    const lim = f.kind === 'stream' ? .12 : f.kind === 'lake' ? .6 : .4;
    if (best <= lim) near.push({ ...f, d: best, km, alongKm: along * .05 });
  }
  near.sort((a, b) => a.km - b.km);
  const by = k => near.filter(f => f.kind === k);
  const parts = [];
  const peaks = by('peak').filter(p => p.ele).sort((a, b) => b.ele - a.ele).slice(0, 2).sort((a, b) => a.km - b.km);
  const top = peaks.filter(p => p.d < .15), side = peaks.filter(p => p.d >= .15);
  if (top.length) parts.push(`עולים ל${list(top.map(p => `${p.name} (${ele(p.ele)})`))}.`);
  if (side.length) parts.push(`עוברים ליד ${list(side.map(p => `${p.name} (${ele(p.ele)})`))}.`);
  const streams = by('stream'), alongS = streams.filter(f => f.alongKm >= 1.5).sort((a, b) => b.alongKm - a.alongKm).slice(0, 2);
  const cross = streams.filter(f => !alongS.includes(f)).slice(0, 3);
  if (alongS.length && cross.length) parts.push(`הולכים לאורך ${list(alongS.map(f => f.name))}, וחוצים את ${list(cross.map(f => f.name))}.`);
  else if (alongS.length) parts.push(`הולכים לאורך ${list(alongS.map(f => f.name))}.`);
  else if (cross.length) parts.push(`חוצים את ${list(cross.map(f => f.name))}.`);
  const springs = by('spring').slice(0, 3);
  if (springs.length) parts.push(springs.length === 1 ? `בדרך יש מעיין: ${springs[0].name}.` : `בדרך יש מעיינות: ${list(springs.map(f => f.name))}.`);
  const ruins = by('ruin').slice(0, 2);
  if (ruins.length) parts.push(`בדרך יש שרידים עתיקים: ${list(ruins.map(f => f.name))}.`);
  const lakes = by('lake').slice(0, 1);
  if (lakes.length) parts.push(`הדרך עוברת ליד ${lakes[0].name}.`);
  out[s.n] = parts.join(' ');
}
writeFileSync('public/data/stage-info.json', JSON.stringify(out, null, 1));
for (const [n, t] of Object.entries(out)) console.log(n, t);
