// Builds public/og.jpg (1200×630), the link preview: a band of the relief map with the trail, the figure and the title.
//   node scripts/make_og.mjs
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { hagaiSVG } from '../src/character.js';

const W = 1200, H = 630;
const relief = JSON.parse(fs.readFileSync('public/map/relief.json', 'utf8'));
const trail = JSON.parse(fs.readFileSync('public/data/trail.json', 'utf8')).pts;
const img = 'data:image/jpeg;base64,' + fs.readFileSync('public/map/relief-day.jpg').toString('base64');
const SRC_W = 1326, k = W / SRC_W, px = SRC_W / relief.w;          // source jpg is 2× the map units
const KX = Math.cos(31.4 * Math.PI / 180);
const LAT_TOP = 32.45, y0 = (relief.lat0 - LAT_TOP) * relief.s * px;
const X = lon => (lon - relief.lon0) * KX * relief.s * px * k, Y = lat => ((relief.lat0 - lat) * relief.s * px - y0) * k;
const line = trail.filter((p, i) => i % 3 === 0).map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
const me = trail.reduce((a, p) => Math.abs(p[1] - 32.02) < Math.abs(a[1] - 32.02) ? p : a);
const fw = 150, fh = fw * 444 / 220;
const fig = hagaiSVG({ hat: true, shirt: 'black', walk: false, pose: 'walk' }).replace('<svg ', `<svg width="${fw}" height="${fh}" `);

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@700;800&family=Karantina:wght@700&display=swap">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; background: #3a86b2; }
  .bg { position: absolute; left: 0; top: ${(-y0 * k).toFixed(1)}px; width: ${W}px; }
  svg.t { position: absolute; inset: 0; }
  .fade { position: absolute; inset: 0; background: linear-gradient(270deg, rgba(23,48,58,.88) 0%, rgba(23,48,58,.6) 38%, rgba(23,48,58,0) 62%); }
  .me { position: absolute; left: ${(X(me[0]) - fw / 2).toFixed(1)}px; top: ${(Y(me[1]) - fh * .99).toFixed(1)}px; filter: drop-shadow(0 8px 10px rgba(0,0,0,.35)); }
  .txt { position: absolute; right: 70px; top: 150px; color: #fff; text-align: right; }
  h1 { font: 700 168px/0.9 "Karantina", sans-serif; letter-spacing: 1px; }
  p { font: 800 40px/1.25 "Assistant", sans-serif; margin-top: 18px; }
  p b { color: #ffb066; }
</style></head><body>
<img class="bg" src="${img}">
<svg class="t" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <polyline points="${line}" fill="none" stroke="#17303a" stroke-opacity=".3" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" transform="translate(0 3)"/>
  <polyline points="${line}" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
  <polyline points="${line}" fill="none" stroke="#ef7d22" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
<div class="fade"></div>
<div class="me">${fig}</div>
<div class="txt"><h1>חגי בשביל</h1><p>שביל ישראל, מהחרמון לאילת.<br><b>איפה הוא עכשיו?</b></p></div>
</body></html>`;

const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 86 });
await b.close();
console.log('public/og.jpg');
