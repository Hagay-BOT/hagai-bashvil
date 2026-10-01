// Assembles a design-round page: node design/build-round.mjs round2
// Inlines the character code, a thinned trail line, the stage list and the relief images.
import fs from 'node:fs';

const name = process.argv[2];
const t = JSON.parse(fs.readFileSync('public/data/trail.json', 'utf8')).pts;
const thin = [];
let next = 0;
for (const p of t) if (p[2] >= next) { thin.push([+p[0].toFixed(4), +p[1].toFixed(4), +p[2].toFixed(1)]); next = p[2] + 0.5; }
thin.push(t[t.length - 1].map((v, i) => +v.toFixed(i < 2 ? 4 : 1)));
const stages = JSON.parse(fs.readFileSync('public/data/stages.json', 'utf8')).stages.map(s => ({ to: s.to, kmEnd: s.kmEnd, restAfter: s.restAfter }));
const b64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');

let html = fs.readFileSync(`design/${name}.tpl.html`, 'utf8');
const put = (k, v) => { html = html.split(k).join(v); };
put('__CHARACTER__', fs.readFileSync('design/character.js', 'utf8').replace(/^if \(typeof module.*$/m, ''));
put('__TRAIL__', JSON.stringify(thin));
put('__STAGES__', JSON.stringify(stages));
if (html.includes('__IMG_DAY__')) put('__IMG_DAY__', b64('data-raw/r2-day.jpg'));
if (html.includes('__IMG_GOLD__')) put('__IMG_GOLD__', b64('data-raw/r2-gold.jpg'));
fs.writeFileSync(`design/${name}.html`, html);
console.log(name, (html.length / 1024).toFixed(0) + 'KB', thin.length, 'pts');
