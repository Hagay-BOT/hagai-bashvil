// Pre-renders every close-up tile (terrain + illustrated features) into one image at 2x, so the
// phone shows a single picture instead of parsing thousands of SVG shapes. Labels stay vector
// (a small separate file) so text remains sharp.
//   node scripts/raster_tiles.mjs        -> public/tiles/<id>.r.jpg and <id>.labels.svg
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const dir = 'public/tiles', src = 'tiles-src';
const { cells } = JSON.parse(fs.readFileSync(`${dir}/index.json`, 'utf8'));
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ deviceScaleFactor: 2 })).newPage();
let n = 0;
for (const c of cells) {
  const out = `${dir}/${c.id}.r.jpg`;
  if (fs.existsSync(out)) continue;
  const svg = fs.readFileSync(`${src}/${c.id}.svg`, 'utf8');
  const li = svg.indexOf('<g class="l-labels">');
  const body = li >= 0 ? svg.slice(0, li) : svg;
  const labels = li >= 0 ? svg.slice(li) : '';
  fs.writeFileSync(`${dir}/${c.id}.labels.svg`, labels);
  const jpg = fs.readFileSync(`${src}/${c.id}.jpg`).toString('base64');
  await p.setViewportSize({ width: c.w, height: c.h });
  await p.setContent(`<!doctype html><body style="margin:0"><div style="position:relative;width:${c.w}px;height:${c.h}px">
    <img src="data:image/jpeg;base64,${jpg}" style="position:absolute;inset:0;width:${c.w}px;height:${c.h}px">
    <svg style="position:absolute;inset:0" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" xmlns="http://www.w3.org/2000/svg">${body}</svg></div></body>`);
  await p.screenshot({ path: out, type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: c.w, height: c.h } });
  n++;
}
await b.close();
console.log('rendered', n, 'of', cells.length);
