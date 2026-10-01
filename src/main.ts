import './style.css';
// @ts-ignore plain JS module
import { hagaiSVG, campSVG } from './character.js';
import { displayKm, pointAtKm, stageAtKm, type PublicState, type Stage, type TrailPt } from '../supabase/functions/_shared/trail';
import { watchState, loadPosts, loadDays, loadStageNames, photoUrl, sendGuess, guessHistogram, sb, type Post, type Day } from './live';

// overview projection (matches scripts/render_relief.py)
const S = 420, LON0 = 34.15, LAT0 = 33.45, KX = Math.cos(31.4 * Math.PI / 180), W = 663, H = 1701;
const X = (lon: number) => (lon - LON0) * KX * S, Y = (lat: number) => (LAT0 - lat) * S;
const TOWNS: [string, number, number, number][] = [['קריית שמונה', 35.57, 33.21, 1], ['צפת', 35.50, 32.97, -1], ['טבריה', 35.53, 32.79, 1], ['חיפה', 34.99, 32.80, -1], ['נצרת', 35.30, 32.70, -1], ['נתניה', 34.86, 32.33, 1], ['תל אביב', 34.78, 32.08, 1], ['ירושלים', 35.21, 31.77, 1], ['באר שבע', 34.79, 31.25, -1], ['ערד', 35.21, 31.26, 1], ['מצפה רמון', 34.80, 30.61, -1], ['אילת', 34.95, 29.56, -1]];

const $ = (id: string) => document.getElementById(id)!;
const PAD = 320;
const ov = $('overview'), loc = $('local'), mapEl = $('map'), lw = $('lwrap'), lm = $('lmap'), scr = $('screen'), zb = $('zoom') as HTMLButtonElement;
const fmt = (n: number) => Math.round(n).toLocaleString('he-IL');

interface Cell { id: string; lon0: number; lat0: number; lon1: number; lat1: number; ppd: number; w: number; h: number }
let TRAIL: TrailPt[] = [], LINE: TrailPt[] = [], STAGES: Stage[] = [], ELE: number[] = [], GAIN: number[] = [], CELLS: Cell[] = [];
let TOTAL = 1080.8, DAYS_N = 65, posts: Post[] = [], days: Day[] = [], NAMES = new Map<number, string>();
const nameFrom = (n: number) => NAMES.get(n) ?? '';
const nameTo = (n: number) => NAMES.get(n + 1) ?? (n === STAGES.length ? 'אילת' : '');
let state: PublicState | null = null, km = 0, estimated = false, ageMin = 0;
let zoomed = false, lz = 1, offX = 0, cell: Cell | null = null, cellSvg = '';

const eleAt = (k: number) => ELE[Math.max(0, Math.min(ELE.length - 1, Math.round(k / 0.1)))] ?? 0;
const gainAt = (k: number) => GAIN[Math.max(0, Math.min(GAIN.length - 1, Math.round(k / 0.1)))] ?? 0;
const pts = (k0: number, k1: number, fx: (n: number) => number, fy: (n: number) => number) =>
  LINE.filter(p => p[2] >= k0 && p[2] <= k1).map(p => fx(p[0]).toFixed(1) + ',' + fy(p[1]).toFixed(1)).join(' ');

/** What the figure shows. The coffee break alternates between brewing and sipping every 20 minutes. */
function figure(scale: number) {
  const st = state?.status ?? 'before';
  if (st === 'camp') { const w = 330 * scale, h = w * 240 / 380; return { svg: campSVG({}).replace('<svg ', `<svg width="${w}" height="${h}" `), w, h, anchor: .92 }; }
  const sit = st === 'break' || st === 'rest';
  const variant = st === 'rest' || Math.floor(Date.now() / 1200000) % 2 ? 'sip' : 'brew';
  const svg = hagaiSVG({ hat: true, shirt: 'black', walk: st === 'walking', pose: sit ? 'coffee' : 'walk', variant });
  return { svg: svg.replace('<svg ', `<svg width="${220 * scale}" height="${444 * scale}" `), w: 220 * scale, h: 444 * scale, anchor: .99 };
}

function drawOverview() {
  const [lon, lat] = pointAtKm(TRAIL, km), cx = X(lon), cy = Y(lat);
  const done = pts(0, km, X, Y);
  const lbl = (t: string, x: number, y: number) => `<text x="${x}" y="${y}" font-size="13" font-weight="700" text-anchor="middle" font-family="Assistant,sans-serif" fill="#fff" stroke="#17303a" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke">${t}</text>`;
  const towns = TOWNS.map(t => `<circle cx="${X(t[1])}" cy="${Y(t[2])}" r="3.6" fill="#fff" stroke="#17303a" stroke-width="1.8"/>` + lbl(t[0], X(t[1]) - t[3] * 4, Y(t[2]) - 8)).join('');
  const nodes = STAGES.filter(s => s.kmEnd <= km).map(s => { const g = pointAtKm(TRAIL, s.kmEnd); return `<circle class="node" data-n="${s.n}" cx="${X(g[0])}" cy="${Y(g[1])}" r="6" fill="#fff" stroke="#1f5fae" stroke-width="2.6" style="cursor:pointer"/>`; }).join('');
  const pins = posts.filter(p => p.km != null && p.km <= km && p.photos.length).map(p => { const g = pointAtKm(TRAIL, p.km!); return `<g class="node" data-n="${stageAtKm(STAGES, p.km!).n}" style="cursor:pointer"><circle cx="${X(g[0]) + 9}" cy="${Y(g[1]) - 9}" r="7" fill="#ef7d22" stroke="#fff" stroke-width="2"/><rect x="${X(g[0]) + 5.5}" y="${Y(g[1]) - 11}" width="7" height="5" rx="1" fill="#fff"/></g>`; }).join('');
  let puffs = '';
  for (let r = 0; r < 4; r++) for (let x = -30; x < W + 60; x += 44) puffs += `<circle cx="${x + r * 15}" cy="${cy + 128 + r * 30 + (((x / 44 | 0) + r) % 2) * 12}" r="${30 + ((x * 7 + r * 13) % 19)}"/>`;
  const fog = `<g class="fogl"><g fill="#35607a" opacity=".28" transform="translate(5 9)" filter="url(#soft)">${puffs}</g><g fill="#fff" opacity=".92" filter="url(#soft)">${puffs}</g></g><rect x="0" y="${cy + 222}" width="${W}" height="${H}" fill="#fff" opacity=".8"/>`;
  const f = figure(.087);
  mapEl.style.margin = `${PAD}px 0`;
  mapEl.innerHTML = `<img src="./map/relief-day.jpg" width="${W}" height="${H}" alt="">
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter><filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-opacity=".45"/></filter></defs>
    <polyline points="${done}" fill="none" stroke="#fff" stroke-width="7.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#sh)"/>
    <polyline points="${done}" fill="none" stroke="#ef7d22" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${nodes}${pins}${towns}${fog}
    <circle class="ping" cx="${cx}" cy="${cy}" r="6" fill="#ef7d22"/><circle cx="${cx}" cy="${cy}" r="5" fill="#ef7d22" stroke="#fff" stroke-width="2"/>
    <g transform="translate(${cx - f.w / 2} ${cy - f.h * f.anchor})" filter="url(#sh)">${f.svg}</g>
  </svg>`;
  return { cx, cy };
}

function cellFor(lon: number, lat: number) { return CELLS.find(c => lon >= c.lon0 && lon < c.lon1 && lat <= c.lat0 && lat > c.lat1) ?? null; }

async function drawLocal() {
  const [lon, lat] = pointAtKm(TRAIL, km);
  const c = cellFor(lon, lat);
  zb.disabled = !c;
  if (!c) return null;
  if (c !== cell) { cell = c; cellSvg = await (await fetch(`./tiles/${c.id}.svg`)).text(); }
  const LX = (v: number) => (v - c.lon0) * KX * c.ppd, LY = (v: number) => (c.lat0 - v) * c.ppd;
  const lx = LX(lon), ly = LY(lat), f = figure(.1), near = pts(Math.max(0, km - 60), km, LX, LY);
  lm.innerHTML = `<img src="./tiles/${c.id}.jpg" width="${c.w}" height="${c.h}" alt="">
  <svg width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" xmlns="http://www.w3.org/2000/svg" font-family="Assistant,sans-serif">
    <defs><filter id="sh2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-opacity=".45"/></filter></defs>
    ${cellSvg}
    <polyline points="${near}" vector-effect="non-scaling-stroke" fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" filter="url(#sh2)"/>
    <polyline points="${near}" vector-effect="non-scaling-stroke" fill="none" stroke="#ef7d22" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle class="ping" cx="${lx}" cy="${ly}" r="8" fill="#ef7d22"/>
    <g transform="translate(${lx - f.w / 2} ${ly - f.h * f.anchor})" filter="url(#sh2)">${f.svg}</g>
  </svg>`;
  setLZ(lz, 0, 0, true);
  return { lx, ly };
}

const STATUS: Record<string, [string, string]> = {
  before: ['יוצא לדרך ב-5.10 מהחרמון', 'before'], walking: ['הולך עכשיו', ''], break: ['הפסקת קפה', 'coffee'],
  camp: ['לילה טוב', 'camp'], rest: ['יום מנוחה', 'rest'], hidden: ['חגי בהפסקה', 'hidden'],
};
function ago(min: number) { return min < 1 ? 'עכשיו' : min < 60 ? `לפני ${Math.round(min)} דקות` : min < 1440 ? `לפני ${Math.round(min / 60)} שעות` : `לפני ${Math.round(min / 1440)} ימים`; }

function drawHud() {
  const st = state?.status ?? 'before';
  let [txt, cls] = STATUS[st];
  if (st === 'walking') { txt = estimated ? `מיקום משוער · עדכון אחרון ${ago(ageMin)}` : `הולך עכשיו · עדכון ${ago(ageMin)}`; cls = estimated ? 'est' : ''; }
  $('stxt').textContent = txt;
  $('dot').className = 'dot ' + cls;
  scr.classList.toggle('night', st === 'camp');
  const sg = stageAtKm(STAGES, km);
  $('where').textContent = st === 'before' ? 'נקודת ההתחלה: קופות החרמון' : nameFrom(sg.n) ? `יצא מ${nameFrom(sg.n)} · קטע ${sg.n} מתוך ${STAGES.length}` : `קטע ${sg.n} מתוך ${STAGES.length}`;
  $('nKm').textContent = fmt(km);
  $('nKmOf').textContent = `ק"מ מתוך ${fmt(TOTAL)}`;
  $('nDay').textContent = String(state?.dayNo ?? 0);
  $('nDayOf').textContent = `יום מתוך ${DAYS_N}`;
  $('nEle').textContent = fmt(eleAt(km));
  ($('bar') as HTMLElement).style.width = (km / TOTAL * 100).toFixed(1) + '%';
  const left = Math.max(0, DAYS_N - (state?.dayNo ?? 0));
  $('sub').textContent = `${(km / TOTAL * 100).toFixed(0)}% מהשביל · עלייה מצטברת ${fmt(gainAt(km))} מ' · עוד כ-${left} ימים`;
}

let firstDraw = true;
async function render() {
  if (!state) return;
  const d = displayKm(state, Date.now());
  km = d.km; estimated = d.estimated; ageMin = d.ageMin;
  drawHud();
  const p = drawOverview();
  const keepTop = ov.scrollTop;
  const l = await drawLocal();
  if (firstDraw) {
    firstDraw = false;
    requestAnimationFrame(() => { ov.scrollTop = p.cy + PAD - ov.clientHeight * .5; cam(); });
  } else { ov.scrollTop = keepTop; cam(); }
  P = { ...p, lx: l?.lx ?? 0, ly: l?.ly ?? 0 };
}
let P = { cx: 0, cy: 0, lx: 0, ly: 0 };

// camera: the overview pans sideways to follow the trail while scrolling north-south
function trailXAt(y: number) { let lo = 0, hi = LINE.length - 1; const lat = LAT0 - y / S; while (hi - lo > 1) { const m = (lo + hi) >> 1; (LINE[m][1] > lat) ? lo = m : hi = m; } return X(LINE[lo][0]); }
function cam() { const mid = ov.scrollTop + ov.clientHeight * .5 - PAD; const x = trailXAt(Math.max(0, Math.min(mid, H - 1))); offX = Math.max(0, Math.min(W - ov.clientWidth, x - ov.clientWidth / 2)); mapEl.style.transform = `translateX(${-offX}px)`; }
ov.addEventListener('scroll', cam, { passive: true });
addEventListener('resize', cam);

// zoom
function setLZ(z: number, cx: number, cy: number, silent = false) {
  if (!cell) return;
  z = Math.max(1, Math.min(3, z)); const r = z / lz, ax = loc.scrollLeft + cx, ay = loc.scrollTop + cy;
  lz = z; lm.style.transform = `scale(${z})`; lw.style.width = cell.w * z + 'px'; lw.style.height = cell.h * z + 'px';
  if (!silent) { loc.scrollLeft = ax * r - cx; loc.scrollTop = ay * r - cy; }
}
function toggleZoom() {
  if (zb.disabled) return;
  zoomed = !zoomed;
  if (zoomed) {
    setLZ(1, 0, 0, true); lz = 1;
    mapEl.style.transition = 'transform .55s ease-in'; mapEl.style.transformOrigin = `${P.cx}px ${P.cy}px`; mapEl.style.transform = `translateX(${-offX}px) scale(6)`;
    loc.scrollLeft = P.lx - loc.clientWidth / 2; loc.scrollTop = P.ly - loc.clientHeight * .55;
    setTimeout(() => { loc.classList.add('on'); ov.classList.add('off'); }, 380);
    zb.textContent = 'כל השביל';
  } else {
    loc.classList.remove('on'); ov.classList.remove('off');
    mapEl.style.transform = `translateX(${-offX}px)`;
    setTimeout(() => { mapEl.style.transition = 'none'; mapEl.style.transformOrigin = '0 0'; }, 560);
    zb.textContent = 'התקרב אליי';
  }
}
function zoomBy(k: number, cx?: number, cy?: number) {
  if (!zoomed) { if (k > 1) toggleZoom(); return; }
  if (lz <= 1.01 && k < 1) { toggleZoom(); return; }
  setLZ(lz * k, cx ?? loc.clientWidth / 2, cy ?? loc.clientHeight / 2);
}
zb.onclick = toggleZoom;
$('zin').onclick = () => zoomBy(1.5);
$('zout').onclick = () => zoomBy(1 / 1.5);
let pinch: { d: number; z: number } | null = null;
const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
scr.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = { d: dist(e.touches[0], e.touches[1]), z: lz }; }, { passive: true });
scr.addEventListener('touchmove', e => {
  if (!pinch || e.touches.length !== 2) return; e.preventDefault();
  const k = dist(e.touches[0], e.touches[1]) / pinch.d;
  if (!zoomed) { if (k > 1.4) { pinch = null; toggleZoom(); } return; }
  if (pinch.z <= 1.01 && k < .7) { pinch = null; toggleZoom(); return; }
  const r = loc.getBoundingClientRect();
  setLZ(pinch.z * k, (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top);
}, { passive: false });
scr.addEventListener('touchend', () => { pinch = null; }, { passive: true });
scr.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); const r = loc.getBoundingClientRect(); zoomBy(Math.exp(-e.deltaY * .01), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

// stage sheet
const sheet = $('sheet'), sheetContent = $('sheetContent');
function closeSheet() { sheet.hidden = true; }
$('sheetClose').onclick = closeSheet;
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function profileSVG(k0: number, k1: number, upTo: number) {
  const i0 = Math.round(k0 / .1), i1 = Math.max(i0 + 2, Math.round(k1 / .1));
  const seg = ELE.slice(i0, i1 + 1), lo = Math.min(...seg), hi = Math.max(...seg), w = 320, h = 110, pad = 18;
  const x = (i: number) => (i / (seg.length - 1)) * w, y = (v: number) => pad + (1 - (v - lo) / ((hi - lo) || 1)) * (h - pad * 2);
  const d = seg.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const doneI = Math.max(0, Math.min(seg.length - 1, Math.round((upTo - k0) / .1)));
  const dd = seg.slice(0, doneI + 1).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return `<svg class="profile" viewBox="-30 0 ${w + 36} ${h}" role="img" aria-label="פרופיל גובה">
    <line x1="0" x2="${w}" y1="${y(hi)}" y2="${y(hi)}" stroke="#dfe5e8"/><line x1="0" x2="${w}" y1="${y(lo)}" y2="${y(lo)}" stroke="#dfe5e8"/>
    <text x="-4" y="${y(hi) + 4}" text-anchor="end">${fmt(hi)}</text><text x="-4" y="${y(lo) + 4}" text-anchor="end">${fmt(lo)}</text>
    <path d="${d} L${w} ${h} L0 ${h}Z" fill="#eef4f0"/><path d="${d}" fill="none" stroke="#9fb3a8" stroke-width="2"/>
    ${dd ? `<path d="${dd}" fill="none" stroke="#ef7d22" stroke-width="3" stroke-linejoin="round"/>` : ''}
  </svg>`;
}

function openStage(n: number) {
  const s = STAGES.find(x => x.n === n); if (!s) return;
  const mine = posts.filter(p => p.km != null && p.km >= s.kmStart && p.km < s.kmEnd + .01);
  const day = days.find(d => d.km_start <= s.kmStart + .5 && d.km_end >= s.kmEnd - .5);
  const gain = gainAt(s.kmEnd) - gainAt(s.kmStart);
  const facts = [`${s.km} ק"מ`, s.hours ? `${s.hours} שעות הליכה` : '', `עלייה ${fmt(gain)} מ'`, s.segs ? `מקטעים רשמיים ${s.segs}` : '', day?.steps ? `${fmt(day.steps)} צעדים` : ''].filter(Boolean);
  const title = nameTo(s.n) ? `${nameFrom(s.n)} ← ${nameTo(s.n)}` : nameFrom(s.n) ? `מ${nameFrom(s.n)} והלאה` : `קטע ${s.n}`;
  sheetContent.innerHTML = `<h2 id="sheetTitle">${esc(title)}</h2>
    <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>
    ${profileSVG(s.kmStart, s.kmEnd, km)}
    ${mine.map(p => `${p.body ? `<p class="story">${esc(p.body)}</p>` : ''}${p.photos.length ? `<div class="photos">${p.photos.map(ph => `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">`).join('')}</div>` : ''}`).join('') || (s.kmEnd <= km ? '<p class="muted">עוד אין תמונות מהקטע הזה.</p>' : '')}`;
  sheet.hidden = false;
}

async function openGuess() {
  const h = await guessHistogram();
  const max = Math.max(1, ...h.map(x => x.n));
  sheetContent.innerHTML = `<h2 id="sheetTitle">מתי חגי יגיע לאילת?</h2>
    <p class="muted">לפי התוכנית: 15 בדצמבר. מה הניחוש שלך?</p>
    <form class="guess" id="gform"><input id="gname" required maxlength="40" placeholder="השם שלך" aria-label="השם שלך"><input id="gdate" type="date" required min="2026-11-20" max="2027-01-31" aria-label="תאריך"><button type="submit">שליחה</button></form>
    <p class="muted" id="gmsg" role="status"></p>
    ${h.length ? `<div class="hist" title="הניחושים">${h.map(x => `<i style="height:${(x.n / max * 100).toFixed(0)}%" title="${x.guess}: ${x.n}"></i>`).join('')}</div><p class="muted">${h.reduce((a, x) => a + x.n, 0)} ניחושים עד עכשיו</p>` : ''}`;
  sheet.hidden = false;
  ($('gform') as HTMLFormElement).onsubmit = async e => {
    e.preventDefault();
    const ok = await sendGuess(($('gname') as HTMLInputElement).value.trim(), ($('gdate') as HTMLInputElement).value);
    $('gmsg').textContent = ok ? 'הניחוש נשמר.' : 'הניחוש לא נשמר. נסו שוב בעוד רגע.';
  };
}

$('card').onclick = () => openStage(stageAtKm(STAGES, km).n);
ov.addEventListener('click', e => { const n = (e.target as Element).closest('.node')?.getAttribute('data-n'); if (n) openStage(+n); });
if (sb) {
  const g = document.createElement('button'); g.type = 'button'; g.className = 'zoom'; g.textContent = 'ניחוש: מתי באילת?';
  g.style.cssText = 'position:absolute;z-index:4;left:12px;top:calc(46% + 100px)'; g.onclick = openGuess; scr.appendChild(g);
}

async function boot() {
  const [t, st, pr, tiles] = await Promise.all([
    fetch('./data/trail.json').then(r => r.json()),
    fetch('./data/stages.json').then(r => r.json()),
    fetch('./data/profile.json').then(r => r.json()),
    fetch('./tiles/index.json').then(r => r.ok ? r.json() : { cells: [] }).catch(() => ({ cells: [] })),
  ]);
  TRAIL = t.pts; TOTAL = st.totalKm; STAGES = st.stages; DAYS_N = st.walkDays + st.restDays; ELE = pr.ele; GAIN = pr.gain; CELLS = tiles.cells;
  let next = 0; LINE = TRAIL.filter(p => (p[2] >= next ? (next = p[2] + .25, true) : false));
  [posts, days, NAMES] = await Promise.all([loadPosts(), loadDays(), loadStageNames()]);
  let lastStage = 0;
  await watchState(async s => { state = s; const n = stageAtKm(STAGES, s.km).n; if (n !== lastStage) { lastStage = n; NAMES = await loadStageNames(); } render(); });
  setInterval(render, 60000);
  if (sb) sb.channel('posts').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, async () => { posts = await loadPosts(); render(); }).subscribe();
}
boot();
