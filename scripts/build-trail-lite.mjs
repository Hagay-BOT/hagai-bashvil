// The site's copy of the trail: public/data/trail.json simplified (Douglas-Peucker, 3 m) and rounded.
// 3 m is under a pixel even at the closest zoom (about 7 m per pixel), so the line and the figure land where they did.
// Run: node scripts/build-trail-lite.mjs   Output: public/data/trail-lite.json { totalKm, pts: [[lon,lat,km],...] }
import fs from 'node:fs';

const TOL = 3; // metres
const { totalKm, pts } = JSON.parse(fs.readFileSync('public/data/trail.json', 'utf8'));
const MY = 110540;

function dp(a, b, keep) {
  // iterative Douglas-Peucker between indices a and b
  const st = [[a, b]];
  while (st.length) {
    const [i, j] = st.pop();
    const kx = Math.cos(pts[i][1] * Math.PI / 180) * 111320;
    const ax = pts[i][0] * kx, ay = pts[i][1] * MY, bx = pts[j][0] * kx, by = pts[j][1] * MY;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let k = i + 1; k < j; k++) {
      const px = pts[k][0] * kx - ax, py = pts[k][1] * MY - ay;
      const t = L2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / L2)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > best) { best = d; bi = k; }
    }
    if (best > TOL) { keep[bi] = 1; st.push([i, bi], [bi, j]); }
  }
}
const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
// keep every point the site picks for its drawn line (one per 0.25 km, see LINE in src/main.ts), so the drawing is unchanged
let next = 0; pts.forEach((p, i) => { if (p[2] >= next) { keep[i] = 1; next = p[2] + .25; } });
dp(0, pts.length - 1, keep);
const out = pts.filter((_, i) => keep[i]).map(p => [+p[0].toFixed(5), +p[1].toFixed(5), p[2]]);
fs.writeFileSync('public/data/trail-lite.json', JSON.stringify({ totalKm, pts: out }));
console.log(`${pts.length} -> ${out.length} points, ${fs.statSync('public/data/trail-lite.json').size} bytes`);
