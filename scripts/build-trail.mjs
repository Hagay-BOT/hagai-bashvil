// Builds the ordered trail line (north -> south) from the OSM relation dump.
// Input:  data-raw/int-rel.json  (Overpass: relation(282071); out geom;)
// Output: public/data/trail.json { pts: [[lon,lat,km],...], totalKm }
// Map data (c) OpenStreetMap contributors, ODbL.
import fs from 'node:fs';

const R = 6371.0088;
export function hav(a, b) {
  const t = Math.PI / 180;
  const dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const rel = JSON.parse(fs.readFileSync('data-raw/int-rel.json', 'utf8')).elements[0];
const ways = rel.members.filter(m => m.type === 'way' && m.geometry?.length > 1)
  .map(m => ({ id: m.ref, pts: m.geometry.map(g => [g.lon, g.lat]) }));

// Chain ways greedily: always take the unused way whose endpoint is nearest to the chain end.
// Member order is only a hint; nearest-endpoint handles reversed ways and small ordering errors.
const used = new Array(ways.length).fill(false);
const chain = [...ways[0].pts];
used[0] = true;
// make sure we start at the northern end
if (chain[0][1] < chain[chain.length - 1][1]) chain.reverse();
const gaps = [];
const SEARCH = 60; // look this many members ahead/behind for the next piece
let cursor = 0;
for (let n = 1; n < ways.length; n++) {
  const end = chain[chain.length - 1];
  let best = -1, bestD = Infinity, bestRev = false;
  const lo = Math.max(0, cursor - SEARCH), hi = Math.min(ways.length, cursor + SEARCH);
  for (let i = lo; i < hi; i++) {
    if (used[i]) continue;
    const p = ways[i].pts;
    const d0 = hav(end, p[0]), d1 = hav(end, p[p.length - 1]);
    if (d0 < bestD) { bestD = d0; best = i; bestRev = false; }
    if (d1 < bestD) { bestD = d1; best = i; bestRev = true; }
  }
  if (best < 0) {
    // window exhausted: jump to the nearest unused way anywhere
    for (let i = 0; i < ways.length; i++) {
      if (used[i]) continue;
      const p = ways[i].pts;
      const d0 = hav(end, p[0]), d1 = hav(end, p[p.length - 1]);
      if (d0 < bestD) { bestD = d0; best = i; bestRev = false; }
      if (d1 < bestD) { bestD = d1; best = i; bestRev = true; }
    }
    if (best < 0) break;
  }
  used[best] = true;
  cursor = best;
  const p = bestRev ? [...ways[best].pts].reverse() : ways[best].pts;
  if (bestD > 0.05) gaps.push({ afterKmIdx: chain.length, km: +bestD.toFixed(2), way: ways[best].id, at: end });
  chain.push(...(bestD < 0.005 ? p.slice(1) : p));
}

let km = 0;
const pts = chain.map((p, i) => {
  if (i) km += hav(chain[i - 1], p);
  return [+p[0].toFixed(6), +p[1].toFixed(6), +km.toFixed(4)];
});
console.log('ways', ways.length, 'points', pts.length, 'totalKm', km.toFixed(1));
console.log('start', pts[0], 'end', pts[pts.length - 1]);
console.log('gaps >50m:', gaps.length);
for (const g of gaps.sort((a, b) => b.km - a.km).slice(0, 25)) console.log(' ', g.km, 'km near', g.at.map(x => x.toFixed(4)).join(','), 'way', g.way);
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/trail.json', JSON.stringify({ totalKm: +km.toFixed(2), pts }));
