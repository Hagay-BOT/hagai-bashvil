import './style.css';
// @ts-ignore plain JS module
import { hagaiSVG, campSVG } from './character.js';
import { displayKm, pointAtKm, stageAtKm, israelHour, STALE_MIN, type PublicState, type Stage, type TrailPt } from '../supabase/functions/_shared/trail';
import { fetchWeather, wxKind, wxLabel, type Wx } from './weather';
import { skyAt } from './sky';
import { watchState, loadPosts, loadDays, loadStageNames, photoUrl, sendGuess, guessHistogram, sb, START_DATE, type Post, type Day } from './live';

// overview projection (matches scripts/render_relief.py)
let S = 420, LON0 = 34.15, LAT0 = 33.8, W = 663, H = 1932;
const KX = Math.cos(31.4 * Math.PI / 180);
const X = (lon: number) => (lon - LON0) * KX * S, Y = (lat: number) => (LAT0 - lat) * S;
const TOWNS: [string, number, number, number][] = [['קריית שמונה', 35.57, 33.21, 1], ['צפת', 35.50, 32.97, -1], ['טבריה', 35.53, 32.79, 1], ['חיפה', 34.99, 32.80, -1], ['נצרת', 35.30, 32.70, -1], ['נתניה', 34.86, 32.33, 1], ['תל אביב', 34.78, 32.08, 1], ['ירושלים', 35.21, 31.77, 1], ['באר שבע', 34.79, 31.25, -1], ['ערד', 35.21, 31.26, 1], ['מצפה רמון', 34.80, 30.61, -1], ['אילת', 34.95, 29.56, -1]];

const $ = (id: string) => document.getElementById(id)!;
const PAD = 0;
const ov = $('overview'), loc = $('local'), mapEl = $('map'), lw = $('lwrap'), lm = $('lmap'), scr = $('screen'), zb = $('zoom') as HTMLButtonElement;
// view sizes, read once per resize instead of on every scroll event
let VW = 0, VH = 0, KK = 1, LOCX = 0, LOCY = 0;
function measureView() { VW = ov.clientWidth; VH = ov.clientHeight; KK = Math.max(1, VW / W); const r = loc.getBoundingClientRect(); LOCX = r.left; LOCY = r.top; }
const K = () => KK;
/** CSS transform that puts a box's top-left corner at (x, y) in map pixels. */
const at = (x: number, y: number) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
const NF = new Intl.NumberFormat('he-IL');   // one formatter, built once (toLocaleString builds a new one on every call)
const fmt = (n: number) => NF.format(Math.round(n));

interface Cell { id: string; lon0: number; lat0: number; lon1: number; lat1: number; ppd: number; w: number; h: number }
let TRAIL: TrailPt[] = [], LINE: TrailPt[] = [], STAGES: Stage[] = [], ELE: number[] = [], GAIN: number[] = [], CELLS: Cell[] = [];
interface Poi { id: string; title: string; text: string; km: number }
let TOTAL = 1080.8, DAYS_N = 65, posts: Post[] = [], days: Day[] = [], NAMES = new Map<number, string>(), POI: Poi[] = [];
const QS = new URLSearchParams(location.search);   // ?h=17.5 and ?wx=61 force the sky hour and the weather code, for testing
const nameFrom = (n: number) => NAMES.get(n) ?? '';
const nameTo = (n: number) => NAMES.get(n + 1) ?? (n === STAGES.length ? 'אילת' : '');
let state: PublicState | null = null, km = 0, estimated = false, ageMin = 0;
/** The status to show: a "walking" fix older than an hour is shown as no signal until the server catches up. */
const stNow = () => { const st = state?.status ?? 'before'; return st === 'walking' && ageMin > STALE_MIN ? 'nosignal' : st; };
let zoomed = false, lz = 1, offX = 0, cell: Cell | null = null;
/** The stage shown in the close-up (0: the close-up follows the figure), and where it fits on screen. */
let focus = 0, focusView: { z: number; sx: number; sy: number } | null = null, SINFO: Record<string, string> = {};
interface Mosaic { lon0: number; lat0: number; ppd: number; w: number; h: number; parts: { c: Cell; x: number; y: number }[] }
let mosaic: Mosaic | null = null, mosaicRing = 1;
const labelCache = new Map<string, string>();
const labels = async (id: string) => { if (!labelCache.has(id)) labelCache.set(id, await (await fetch(`./tiles/${id}.labels.svg`)).text()); return labelCache.get(id)!; };

/** A point of interest shows once passed, or up to 3 km ahead. Ahead of us it never shows near the end of a stage. */
const poiVisible = (p: Poi) => p.km <= km + .05 || (p.km <= km + 3 && !STAGES.some(s => s.kmEnd > km && Math.abs(p.km - s.kmEnd) < 2.5));
const eleAt = (k: number) => ELE[Math.max(0, Math.min(ELE.length - 1, Math.round(k / 0.1)))] ?? 0;
const gainAt = (k: number) => GAIN[Math.max(0, Math.min(GAIN.length - 1, Math.round(k / 0.1)))] ?? 0;
const pts = (k0: number, k1: number, fx: (n: number) => number, fy: (n: number) => number) =>
  LINE.filter(p => p[2] >= k0 && p[2] <= k1).map(p => fx(p[0]).toFixed(1) + ',' + fy(p[1]).toFixed(1)).join(' ');

/** What the figure shows. The coffee break alternates between brewing and sipping every 20 minutes. */
function figure(scale: number, walking = false) {
  const st = walking ? 'walking' : stNow();
  if (st === 'camp') { const w = 330 * scale, h = w * 240 / 380; return { svg: campSVG({}).replace('<svg ', `<svg width="${w}" height="${h}" `), w, h, anchor: .92 }; }
  const sit = st === 'break' || st === 'rest';
  const variant = walking ? 'brew' : variantNow();
  const svg = hagaiSVG({ hat: true, shirt: 'black', walk: st === 'walking', pose: sit ? 'coffee' : 'walk', variant });
  const faded = st === 'nosignal' ? 'style="opacity:.5;filter:grayscale(1)" ' : '';   // no signal: a grey, see-through figure
  return { svg: svg.replace('<svg ', `<svg ${faded}width="${220 * scale}" height="${444 * scale}" `), w: 220 * scale, h: 444 * scale, anchor: .99 };
}

const variantNow = () => (state?.status === 'rest' || Math.floor(Date.now() / 1200000) % 2 ? 'sip' : 'brew');
const sceneKey = () => `${stNow()}|${variantNow()}|${posts.length}|${NAMES.size}`;
let ovKey = '', lcKey = '';

/** Overview: rebuilt only when the scene changes or a whole km passes; otherwise only the figure moves. */
// the plan's daily stages: a tick where each one ends and a numbered badge in its middle (tap opens it)
function stageMarks(list: Stage[], km: number, fx: (v: number) => number, fy: (v: number) => number, k: number) {
  return list.map(st => {
    const e = pointAtKm(TRAIL, st.kmEnd), m = pointAtKm(TRAIL, (st.kmStart + st.kmEnd) / 2), done = st.kmEnd <= km;
    const ex = fx(e[0]).toFixed(1), ey = fy(e[1]).toFixed(1), mx = fx(m[0]).toFixed(1), my = fy(m[1]).toFixed(1);
    return `<circle cx="${ex}" cy="${ey}" r="${3.4 * k}" fill="#fff" stroke="#17303a" stroke-width="${1.6 * k}"/>`
      + `<g class="node" data-n="${st.n}" style="cursor:pointer"><circle cx="${mx}" cy="${my}" r="${8 * k}" fill="${done ? '#ef7d22' : '#fff'}" stroke="${done ? '#fff' : '#1f5fae'}" stroke-width="${2 * k}"/>`
      + `<text x="${mx}" y="${(+my + 3.3 * k).toFixed(1)}" font-size="${9.5 * k}" font-weight="800" text-anchor="middle" font-family="Assistant,sans-serif" fill="${done ? '#fff' : '#1f5fae'}">${st.n}</text></g>`;
  }).join('');
}
function drawOverview() {
  const [lon, lat] = pointAtKm(TRAIL, km), cx = X(lon), cy = Y(lat);
  const done = pts(0, km, X, Y), f = figure(.087);
  const meT = at(cx - f.w / 2, cy - f.h * f.anchor);
  const key = sceneKey() + '|' + Math.floor(km);
  if (key === ovKey) {
    mapEl.querySelectorAll('.doneO').forEach(e => e.setAttribute('points', done));
    (mapEl.querySelector('#meO') as HTMLElement | null)?.style.setProperty('transform', meT);
    (mapEl.querySelector('.pingO') as HTMLElement | null)?.style.setProperty('transform', at(cx, cy));
    return { cx, cy };
  }
  ovKey = key;
  const lbl = (t: string, x: number, y: number) => `<text x="${x}" y="${y}" font-size="13" font-weight="700" text-anchor="middle" font-family="Assistant,sans-serif" fill="#fff" stroke="#17303a" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke">${t}</text>`;
  const towns = TOWNS.map(t => `<circle cx="${X(t[1])}" cy="${Y(t[2])}" r="3.6" fill="#fff" stroke="#17303a" stroke-width="1.8"/>` + lbl(t[0], X(t[1]) - t[3] * 4, Y(t[2]) - 8)).join('');
  const nodes = stageMarks(STAGES, km, X, Y, 1);
  const pins = posts.filter(p => p.km != null && p.km <= km && p.photos.length && !(p.hold && israelDate(Date.parse(p.created_at)) >= israelDate())).map(p => { const g = pointAtKm(TRAIL, p.km!); return `<g class="node" data-n="${stageAtKm(STAGES, p.km!).n}" style="cursor:pointer"><circle cx="${X(g[0]) + 9}" cy="${Y(g[1]) - 9}" r="7" fill="#ef7d22" stroke="#fff" stroke-width="2"/><rect x="${X(g[0]) + 5.5}" y="${Y(g[1]) - 11}" width="7" height="5" rx="1" fill="#fff"/></g>`; }).join('');
  mapEl.style.margin = `${PAD}px 0`; mapEl.style.width = `${W}px`; mapEl.style.height = `${H}px`;
  const all = pts(0, 99999, X, Y);
  mapEl.innerHTML = `<img src="./map/relief-day.jpg" width="${W}" height="${H}" alt="" decoding="async" draggable="false">
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="${all}" stroke="#17303a" stroke-opacity=".45" stroke-width="7.5"/>
    <polyline points="${all}" stroke="#fff" stroke-width="5"/>
    <polyline points="${all}" stroke="#1f5fae" stroke-width="2.4" stroke-dasharray="6 5"/></g>
        <polyline class="doneO" points="${done}" fill="none" stroke="#17303a" stroke-opacity=".3" stroke-width="13" stroke-linejoin="round" stroke-linecap="round" transform="translate(0 1.5)"/>
    <polyline class="doneO" points="${done}" fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline class="doneO" points="${done}" fill="none" stroke="#ef7d22" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline class="doneO" points="${done}" fill="none" stroke="#ffd27a" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${nodes}${pins}${towns}
  </svg>
  <div class="pingw pingO" style="transform:${at(cx, cy)}"><i class="ping"></i><i class="pdot"></i></div>
  <div class="fig" id="meO" style="transform:${meT}">${f.svg}</div>`;
  return { cx, cy };
}

function cellFor(lon: number, lat: number) { return CELLS.find(c => lon >= c.lon0 && lon < c.lon1 && lat <= c.lat0 && lat > c.lat1) ?? null; }

/** The chosen stage drawn over the close-up: a wide glow along it, and flags where it starts and ends.
 *  Sized for the zoom it is shown at (z), so the flags read the same on any screen. */
function stageHighlight(s: Stage, LX: (v: number) => number, LY: (v: number) => number, z: number) {
  const line = pts(s.kmStart, s.kmEnd, LX, LY), k = 1 / Math.max(.35, Math.min(2, z));
  const flag = (kmAt: number, label: string, fill: string) => {
    const [x, y] = pointAtKm(TRAIL, kmAt).map((v, i) => i ? LY(v) : LX(v)), w = (label.length * 9 + 22) * k, h = 26 * k;
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${7 * k}" fill="${fill}" stroke="#fff" stroke-width="${3 * k}"/>`
      + `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - 14 * k - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${h / 2}" fill="${fill}" stroke="#fff" stroke-width="${2 * k}"/>`
      + `<text x="${x.toFixed(1)}" y="${(y - 14 * k - h * .3).toFixed(1)}" font-size="${15 * k}" font-weight="800" text-anchor="middle" fill="#fff">${label}</text></g>`;
  };
  return `<g class="hl" pointer-events="none"><polyline points="${line}" vector-effect="non-scaling-stroke" fill="none" stroke="#ffd27a" stroke-opacity=".55" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<polyline points="${line}" vector-effect="non-scaling-stroke" fill="none" stroke="#ef7d22" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`
    + flag(s.kmStart, 'התחלה', '#2f8a4e') + flag(s.kmEnd, 'סוף', '#c0392b') + '</g>';
}
/** The zoom and scroll that fit a stage between the title and the open card, clear of the rail and the zoom buttons. */
function fitStage(s: Stage, LX: (v: number) => number, LY: (v: number) => number, m: Mosaic) {
  const p = LINE.filter(q => q[2] >= s.kmStart && q[2] <= s.kmEnd).map(q => [LX(q[0]), LY(q[1])]);
  const x0 = Math.min(...p.map(q => q[0])), x1 = Math.max(...p.map(q => q[0])), y0 = Math.min(...p.map(q => q[1])), y1 = Math.max(...p.map(q => q[1]));
  const sb2 = (document.querySelector('.sheet:not([hidden]) .sheet-body') as HTMLElement | null)?.getBoundingClientRect().top ?? VH - 200;
  const L = 70, R = VW - 62, T = 170, B = Math.max(T + 120, Math.min(VH - 200, sb2) - 20);
  const z = Math.max(Math.max(.15, VW / m.w, VH / m.h), Math.min(3, (R - L) / Math.max(40, x1 - x0), (B - T) / Math.max(40, y1 - y0)));
  return { z, sx: (x0 + x1) / 2 * z - (L + R) / 2, sy: (y0 + y1) / 2 * z - (T + B) / 2 };
}

/** A cell and its neighbours (r rings: 3x3, or 5x5 to give a chosen stage room around it), laid out in one picture
 *  (pre-rendered images + vector labels). */
function mosaicFor(c: Cell, r = 1): Mosaic {
  const DLON = c.lon1 - c.lon0, DLAT = c.lat0 - c.lat1;
  const lon0 = c.lon0 - DLON * r, lat0 = c.lat0 + DLAT * r, ppd = c.ppd;
  const parts = CELLS.filter(o => Math.abs(o.lon0 - c.lon0) < DLON * (r + .5) && Math.abs(o.lat0 - c.lat0) < DLAT * (r + .5))
    .map(o => ({ c: o, x: Math.round((o.lon0 - lon0) * KX * ppd), y: Math.round((lat0 - o.lat0) * ppd) }));
  return { lon0, lat0, ppd, w: Math.round((2 * r + 1) * DLON * KX * ppd), h: Math.round((2 * r + 1) * DLAT * ppd), parts };
}

/** Close-up: built only when shown; while shown, only the figure moves. */
async function drawLocal(build = zoomed) {
  const [lon, lat] = pointAtKm(TRAIL, km);
  const fs = focus ? STAGES.find(x => x.n === focus) : undefined;
  const fm = fs ? pointAtKm(TRAIL, (fs.kmStart + fs.kmEnd) / 2) : null;
  const c = (fm && cellFor(fm[0], fm[1])) || cellFor(lon, lat);
  zb.disabled = !c;
  if (!c) return null;
  const ring = fs ? 2 : 1;
  if (c !== cell || !mosaic || ring !== mosaicRing) { cell = c; mosaicRing = ring; mosaic = mosaicFor(c, ring); lcKey = ''; }
  const m = mosaic;
  const LX = (v: number) => (v - m.lon0) * KX * m.ppd, LY = (v: number) => (m.lat0 - v) * m.ppd;
  const lx = LX(lon), ly = LY(lat), f = figure(.1), near = pts(Math.max(0, Math.min(km, fs?.kmStart ?? km) - 60), km, LX, LY);
  if (fs) focusView = fitStage(fs, LX, LY, m);
  const meT = at(lx - f.w / 2, ly - f.h * f.anchor);
  if (!build) return { lx, ly };
  const vis = POI.filter(poiVisible), key = c.id + '|' + focus + '|' + sceneKey() + '|' + vis.map(p => p.id).join();
  if (key === lcKey) {
    lm.querySelectorAll('.nearL').forEach(e => e.setAttribute('points', near));
    (lm.querySelector('#meL') as HTMLElement | null)?.style.setProperty('transform', meT);
    (lm.querySelector('#pingL') as HTMLElement | null)?.style.setProperty('transform', at(lx, ly));
    return { lx, ly };
  }
  lcKey = key;
  // start the pictures now, while the labels load (the centre one first)
  for (const p of m.parts) { const i = new Image(); i.fetchPriority = p.c === c ? 'high' : 'low'; i.src = `./tiles/${p.c.id}.r.jpg`; }
  const labelSvgs = await Promise.all(m.parts.map(async p => `<g transform="translate(${p.x} ${p.y})">${await labels(p.c.id)}</g>`));
  const ahead = pts(km, Math.max(km, fs?.kmEnd ?? 0) + 60, LX, LY);
  lm.style.width = m.w + 'px'; lm.style.height = m.h + 'px';
  lm.innerHTML = m.parts.map(p => `<img src="./tiles/${p.c.id}.r.jpg" alt="" decoding="async" draggable="false"${p.c === c ? ' fetchpriority="high"' : ''} style="position:absolute;left:${p.x}px;top:${p.y}px;width:${p.c.w}px;height:${p.c.h}px">`).join('') + `
  <svg width="${m.w}" height="${m.h}" viewBox="0 0 ${m.w} ${m.h}" xmlns="http://www.w3.org/2000/svg" font-family="Assistant,sans-serif">
<g fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="${ahead}" vector-effect="non-scaling-stroke" stroke="#17303a" stroke-opacity=".45" stroke-width="9"/>
    <polyline points="${ahead}" vector-effect="non-scaling-stroke" stroke="#fff" stroke-width="6.5"/>
    <polyline points="${ahead}" vector-effect="non-scaling-stroke" stroke="#1f5fae" stroke-width="3" stroke-dasharray="9 7"/></g>
        <polyline class="nearL" points="${near}" vector-effect="non-scaling-stroke" fill="none" stroke="#17303a" stroke-opacity=".3" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline class="nearL" points="${near}" vector-effect="non-scaling-stroke" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline class="nearL" points="${near}" vector-effect="non-scaling-stroke" fill="none" stroke="#ef7d22" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline class="nearL" points="${near}" vector-effect="non-scaling-stroke" fill="none" stroke="#ffd27a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${fs ? stageHighlight(fs, LX, LY, focusView!.z) : ''}
    ${stageMarks(STAGES.filter(st => st.kmEnd > Math.min(km, fs?.kmStart ?? km) - 80 && st.kmStart < Math.max(km, fs?.kmEnd ?? 0) + 80), km, LX, LY, 1.6)}
    ${labelSvgs.join('')}
  </svg>
  <div class="pingw" id="pingL" style="transform:${at(lx, ly)}"><i class="ping"></i></div>
  <div class="fig" id="meL" style="transform:${meT}">${f.svg}</div>
  <svg class="pois" width="${m.w}" height="${m.h}" viewBox="0 0 ${m.w} ${m.h}" xmlns="http://www.w3.org/2000/svg">
    ${vis.map((p, i) => {
      const g = pointAtKm(TRAIL, p.km), x = LX(g[0]) + vis.slice(0, i).filter(q => Math.abs(q.km - p.km) < .7).length * 26 + (Math.abs(p.km - km) < .6 ? 38 : 0), y = LY(g[1]) - 22;
      if (x < 0 || y < 0 || x > m.w || y > m.h) return '';
      return `<g class="poi" data-poi="${p.id}" style="cursor:pointer"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="24" fill="transparent"/><line x1="${x.toFixed(1)}" y1="${(y + 10).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y + 22).toFixed(1)}" stroke="#1f5fae" stroke-width="3" stroke-linecap="round"/><circle class="pb" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12"/><text x="${x.toFixed(1)}" y="${(y + 5.5).toFixed(1)}">i</text></g>`;
    }).join('')}
  </svg>`;
  setLZ(lz, 0, 0, true);
  return { lx, ly };
}

const STATUS: Record<string, [string, string]> = {
  before: ['יוצא לדרך ב-5.10 מהחרמון', 'before'], walking: ['הולך עכשיו', ''], break: ['הפסקת קפה', 'coffee'],
  camp: ['לילה טוב', 'camp'], rest: ['יום מנוחה', 'rest'], hidden: ['חגי בהפסקה', 'hidden'],
  nosignal: ['אין קליטה', 'nosignal'], finished: ['הגיע לאילת!', 'done'],
};
/** Before the start: how many days are left, in plain words. */
function countdown() {
  const n = dayDiff(israelDate(), START_DATE);
  return n <= 0 ? 'יוצאים לדרך היום' : n === 1 ? 'יוצאים לדרך מחר' : n === 2 ? 'יוצאים לדרך בעוד יומיים' : `יוצאים לדרך בעוד ${n} ימים`;
}
function ago(min: number) { return min < 1 ? 'עכשיו' : min < 60 ? `לפני ${Math.round(min)} דקות` : min < 1440 ? `לפני ${Math.round(min / 60)} שעות` : `לפני ${Math.round(min / 1440)} ימים`; }

function drawHud() {
  const st = stNow();
  let [txt, cls] = STATUS[st] ?? STATUS.before;
  if (st === 'walking') { txt = estimated ? `מיקום משוער · עדכון אחרון ${ago(ageMin)}` : `הולך עכשיו · עדכון ${ago(ageMin)}`; cls = estimated ? 'est' : ''; }
  if (st === 'nosignal') txt = `אין קליטה · עדכון אחרון ${ago(ageMin)}`;
  if (st === 'before') txt = countdown();
  $('stxt').textContent = txt;
  $('dot').className = 'dot ' + cls;
  scr.classList.toggle('night', st === 'camp');
  const sg = stageAtKm(STAGES, km);
  $('where').textContent = st === 'before' ? 'נקודת ההתחלה: קופות החרמון' : st === 'finished' ? 'סיים את שביל ישראל, מהחרמון עד אילת' : nameFrom(sg.n) ? `יצא מ${nameFrom(sg.n)} · קטע ${sg.n} מתוך ${STAGES.length}` : `קטע ${sg.n} מתוך ${STAGES.length}`;
  $('nKm').textContent = fmt(km);
  $('nKmOf').textContent = `ק"מ מתוך ${fmt(TOTAL)}`;
  $('nDay').textContent = String(state?.dayNo ?? 0);
  $('nDayOf').textContent = `יום מתוך ${DAYS_N}`;
  $('nEle').textContent = fmt(eleAt(km));
  ($('bar') as HTMLElement).style.width = (km / TOTAL * 100).toFixed(1) + '%';
  const left = Math.max(0, DAYS_N - (state?.dayNo ?? 0));
  $('sub').textContent = `${(km / TOTAL * 100).toFixed(0)}% מהשביל · עלייה מצטברת ${fmt(gainAt(km))} מ' · עוד כ-${left} ימים`;
  const t = todayStats();
  $('today').textContent = t ? `היום ${fmt1(t.km)} ק"מ · עלייה ${fmt(t.up)} מ'` : '';
  const done = st === 'finished';
  ($('guess') as HTMLElement).hidden = !sb || done;
  ($('replayCta') as HTMLElement).hidden = !done;
  ($('cardfoot') as HTMLElement).hidden = !t && !sb && !done;
  ($('replay') as HTMLElement).hidden = !(km > .05);
}

const fmt1 = (n: number) => NF.format(Math.round(n * 10) / 10);
const IL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' });
const israelDate = (ms = Date.now()) => IL_DAY.format(new Date(ms));
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const shortDate = (iso: string) => { const [, m, d] = iso.split('-'); return `${+d}.${+m}`; };
const dur = (a: string | null, b: string | null) => {
  if (!a || !b) return '';
  const min = Math.round((Date.parse(b) - Date.parse(a)) / 60000);
  if (!(min > 20 && min < 1000)) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} שעות ו-${m} דקות` : `${h} שעות`) : `${m} דקות`;
};

/** Today so far: from where the last finished day ended (km 0 on day 1) to the displayed position. */
function todayStats() {
  const st = state?.status;
  if (!state || km <= .05 || !(st === 'walking' || st === 'break' || st === 'camp' || st === 'nosignal')) return null;
  const startKm = days.length ? days[days.length - 1].km_end : 0, k = Math.max(0, km - startKm);
  if (k < .05) return null;
  return { km: k, up: Math.max(0, gainAt(km) - gainAt(startKm)) };
}

// sky tint by Israel time, updated in the 60 s tick
function updateSky() {
  const h = QS.has('h') ? +QS.get('h')! : israelHour(Date.now());
  ($('sky') as HTMLElement).style.backgroundColor = skyAt(h);
}

// weather at the trail point of the displayed km, at most one request per 30 minutes
let wxAt = 0, wxNow: Wx | null = null;
function applyWeather(w: Wx) {
  wxNow = w;
  const kind = wxKind(w.code);
  $('wx').className = 'wx ' + kind;
  const chip = $('wxchip');
  $('wxtxt').textContent = `⁦${Math.round(w.temp)}°⁩ · ${wxLabel(w.code, w.isDay)}`;
  chip.title = `רוח ${Math.round(w.wind)} קמ"ש`;
  chip.hidden = false;
}
async function updateWeather() {
  if (QS.has('wx')) { if (!wxNow) applyWeather({ temp: 22, code: +QS.get('wx')!, wind: 12, isDay: true }); return; }
  if (!TRAIL.length || (wxAt && Date.now() - wxAt < 30 * 60000)) return;
  wxAt = Date.now();
  const [lon, lat] = pointAtKm(TRAIL, km);
  const w = await fetchWeather(lat, lon);
  if (w) applyWeather(w); else wxAt = Date.now() - 25 * 60000;   // try again in 5 minutes
}

let firstDraw = true;
async function render() {
  if (!state) return;
  const dt = israelDate();
  if (daysDate && dt !== daysDate) { daysDate = dt; days = await loadDays(); }
  const d = displayKm(state, Date.now());
  km = d.km; estimated = d.estimated; ageMin = d.ageMin;
  updateSky(); void updateWeather();
  drawHud();
  if (replaying) return;
  const keepTop = ov.scrollTop;   // read before the redraw, so it doesn't force a layout
  const p = drawOverview();
  const l = await drawLocal();
  if (firstDraw) {
    firstDraw = false;
    applyZoom(false);
    requestAnimationFrame(() => { ov.scrollTop = p.cy * K() + PAD - VH * .5; cam(); });
    if (!zb.disabled) {
      zoomed = true; const l2 = await drawLocal(true);
      if (l2) { loc.scrollLeft = l2.lx - VW / 2; loc.scrollTop = l2.ly - VH * .5; }
      loc.classList.add('on'); ov.classList.add('off'); zb.textContent = 'כל השביל';
    }
  } else { ov.scrollTop = keepTop; cam(); }
  drawRail();
  P = { ...p, lx: l?.lx ?? 0, ly: l?.ly ?? 0 };
}
let P = { cx: 0, cy: 0, lx: 0, ly: 0 };
let daysDate = '';

// camera: the overview pans sideways to follow the trail while scrolling north-south
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function trailXAt(y: number) { let lo = 0, hi = LINE.length - 1; const lat = LAT0 - y / S; while (hi - lo > 1) { const m = (lo + hi) >> 1; (LINE[m][1] > lat) ? lo = m : hi = m; } return X(LINE[lo][0]); }
// The overview is scaled to the screen width with a transform (not CSS zoom, which keeps the figure's animation on the main thread).
// One transform does it all: scale to the screen, the camera's sideways pan, and the zoom-in toward the figure (ZS around ZO).
let ZO: [number, number] = [0, 0], ZS = 1, lastK = 0;
const camT = () => `scale(${KK}) translateX(${-offX}px) translate(${ZO[0]}px,${ZO[1]}px) scale(${ZS}) translate(${-ZO[0]}px,${-ZO[1]}px)`;
function applyZoom(measure = true) {
  if (measure) measureView();
  mapEl.style.transform = camT();
  if (KK !== lastK) { lastK = KK; mapEl.style.willChange = 'auto'; requestAnimationFrame(() => requestAnimationFrame(() => { mapEl.style.willChange = ''; })); }   // re-draw sharp at the new scale
}
/** Transform-only, no layout reads (sizes are cached); at most once per frame. */
function cam() {
  if (!LINE.length || !VW) return;
  const k = KK, mid = (ov.scrollTop + VH * .5 - PAD) / k, x = trailXAt(Math.max(0, Math.min(mid, H - 1)));
  const o = Math.round(Math.max(0, Math.min(W - VW / k, x - VW / k / 2)) * 4) / 4;
  if (o === offX && mapEl.style.transform) return;
  offX = o; mapEl.style.transform = camT();
}
// While the map moves, the drifting clouds hold still: in every frame the main thread draws they repaint the whole
// screen, and that is what made a drag stutter on a phone. Paused one by one (not with a class on the screen,
// which would restyle the whole map), so a pause costs nothing.
const clouds = () => [...document.querySelectorAll('#wx .cld')].flatMap(e => e.getAnimations());
let movT = 0, held: Animation[] = [];
function moving(ms = 200) {
  if (!movT) { held = clouds().filter(a => a.playState === 'running'); held.forEach(a => a.pause()); }
  clearTimeout(movT); movT = window.setTimeout(() => { movT = 0; held.forEach(a => a.play()); held = []; }, ms);
}
let camFrame = 0;
ov.addEventListener('scroll', () => { moving(); if (!camFrame) camFrame = requestAnimationFrame(() => { camFrame = 0; cam(); }); }, { passive: true });
loc.addEventListener('scroll', () => moving(), { passive: true });
// the screen's size is watched, not just read once: an in-app browser (WhatsApp, Instagram) can start at one
// width and settle at another, and a stale width left the map stuck short of the right edge
new ResizeObserver(() => { applyZoom(); cam(); }).observe(scr);

// zoom: the close-up goes from 6x down to the size where it still fills the screen.
// Panning stays the browser's own scrolling (it runs off the main thread, so it stays smooth on a busy phone).
// While a pinch or the wheel is changing the scale, only a transform moves (no layout, no new scroll size);
// the new size and scroll position are applied once, 160 ms after the gesture settles, and drawn sharp then.
const zmin = () => mosaic ? Math.max(.15, VW / mosaic.w, VH / mosaic.h) : 1;
let gz = 0, gx = 0, gy = 0, g0x = 0, g0y = 0, zFrame = 0, commitT = 0;
function commitZoom(z: number, sx: number, sy: number) {
  if (!mosaic) return;
  cancelAnimationFrame(zFrame); zFrame = 0; clearTimeout(commitT); gz = 0;
  lz = z; lw.style.width = mosaic.w * z + 'px'; lw.style.height = mosaic.h * z + 'px'; lm.style.transform = `scale(${z})`;
  loc.scrollLeft = sx; loc.scrollTop = sy;
  lm.style.willChange = '';
}
function setLZ(z: number, cx: number, cy: number, silent = false) {
  if (!mosaic) return;
  z = clamp(z, zmin(), 6);
  if (silent) { commitZoom(z, loc.scrollLeft, loc.scrollTop); return; }
  moving(400);
  if (!gz) { gz = lz; gx = g0x = loc.scrollLeft; gy = g0y = loc.scrollTop; lm.style.willChange = 'transform'; }
  const r = z / gz;
  gx = clamp((gx + cx) * r - cx, 0, Math.max(0, mosaic.w * z - VW)); gy = clamp((gy + cy) * r - cy, 0, Math.max(0, mosaic.h * z - VH)); gz = z;
  if (!zFrame) zFrame = requestAnimationFrame(() => { zFrame = 0; if (gz) lm.style.transform = `translate(${(g0x - gx).toFixed(1)}px,${(g0y - gy).toFixed(1)}px) scale(${gz})`; });
  clearTimeout(commitT); commitT = window.setTimeout(() => commitZoom(gz, gx, gy), 160);
}
/** Moves the zoom gesture's view by (dx, dy) screen pixels (the two fingers sliding together). */
function panZoom(dx: number, dy: number) { if (gz && mosaic) { gx = clamp(gx - dx, 0, Math.max(0, mosaic.w * gz - VW)); gy = clamp(gy - dy, 0, Math.max(0, mosaic.h * gz - VH)); } }
const curZ = () => gz || lz;
let zoomBusy = false;
async function toggleZoom() {
  if (zb.disabled || zoomBusy || (replaying && !allowZoom)) return;
  zoomBusy = true; setTimeout(() => { zoomBusy = false; }, 900);
  zoomed = !zoomed;
  stopFling(); moving(1000);
  if (zoomed) {
    const l = await drawLocal(true); if (l) { P.lx = l.lx; P.ly = l.ly; }
    const fs = focus && focusView ? STAGES.find(x => x.n === focus) : undefined;
    if (fs && focusView) commitZoom(focusView.z, focusView.sx, focusView.sy); else commitZoom(1, P.lx - VW / 2, P.ly - VH * .55);
    const o = fs ? pointAtKm(TRAIL, (fs.kmStart + fs.kmEnd) / 2) : null;
    mapEl.style.transition = 'none'; ZO = o ? [X(o[0]), Y(o[1])] : [P.cx, P.cy]; ZS = 1; mapEl.style.transform = camT(); void getComputedStyle(mapEl).transform;
    mapEl.style.transition = 'transform .55s ease-in'; ZS = 6; mapEl.style.transform = camT();
    setTimeout(() => { loc.classList.add('on'); ov.classList.add('off'); }, 380);
    zb.textContent = focus ? 'חזרה אליי' : 'כל השביל';
  } else {
    if (gz) commitZoom(gz, gx, gy);
    if (focus) { focus = 0; focusView = null; railKey = ''; drawRail(); }
    loc.classList.remove('on'); ov.classList.remove('off');
    ZS = 1; mapEl.style.transform = camT();
    setTimeout(() => { mapEl.style.transition = 'none'; }, 560);
    zb.textContent = 'התקרב אליי';
  }
}
function zoomBy(k: number, cx?: number, cy?: number) {
  if (!zoomed) { if (k > 1) toggleZoom(); return; }
  if (curZ() <= zmin() + .01 && k < 1) { toggleZoom(); return; }
  setLZ(curZ() * k, cx ?? VW / 2, cy ?? VH / 2);
}
zb.onclick = () => { if (zoomed && focus) void backToMe(); else void toggleZoom(); };
/** From a chosen stage back to the figure, staying in the close-up. */
async function backToMe() {
  focus = 0; focusView = null; railKey = ''; drawRail();
  const l = await drawLocal(true); if (!l) return;
  P.lx = l.lx; P.ly = l.ly; commitZoom(1, l.lx - VW / 2, l.ly - VH * .55);
  zb.textContent = 'כל השביל';
}
/** Opens a stage's card and shows the stage on the detailed map, from its start to its end. */
async function focusStage(n: number) {
  const s = STAGES.find(x => x.n === n); if (!s) return;
  openStage(n);
  const m = pointAtKm(TRAIL, (s.kmStart + s.kmEnd) / 2);
  if (!cellFor(m[0], m[1])) { flyTo(n); return; }   // no detailed map there: show it on the whole-trail map
  focus = n; railKey = ''; drawRail(); stopFling();
  if (!zoomed) { await toggleZoom(); return; }
  if (gz) commitZoom(gz, gx, gy);
  loc.style.opacity = '.35';
  await drawLocal(true);
  if (focusView) commitZoom(focusView.z, focusView.sx, focusView.sy);
  requestAnimationFrame(() => { loc.style.opacity = ''; });
  zb.textContent = 'חזרה אליי';
}
$('zin').onclick = () => zoomBy(1.5);
$('zout').onclick = () => zoomBy(1 / 1.5);

// two-finger pinch. The blocking touchmove listener exists only while two fingers are down,
// so a normal one-finger scroll never waits for the main thread.
let pinch: { d: number; d0: number; z: number; c: [number, number] } | null = null, pinchFrame = 0;
const two = (e: TouchEvent) => {
  const [a, b] = [e.touches[0], e.touches[1]];
  return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, c: [(a.clientX + b.clientX) / 2 - LOCX, (a.clientY + b.clientY) / 2 - LOCY] as [number, number] };
};
let pinchLast: ReturnType<typeof two> | null = null;
function onPinchMove(e: TouchEvent) {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault(); moving(400);
  pinchLast = two(e);
  if (!pinchFrame) pinchFrame = requestAnimationFrame(() => {
    pinchFrame = 0; const t = pinchLast; if (!pinch || !t) return;
    const kAll = t.d / pinch.d0;
    if (!zoomed) { if (kAll > 1.4) { endPinch(); toggleZoom(); } return; }
    if (pinch.z <= zmin() + .01 && kAll < .7) { endPinch(); toggleZoom(); return; }
    if (!gz) setLZ(curZ(), t.c[0], t.c[1]);   // start the gesture view
    panZoom(t.c[0] - pinch.c[0], t.c[1] - pinch.c[1]);
    setLZ(curZ() * t.d / pinch.d, t.c[0], t.c[1]);
    pinch.d = t.d; pinch.c = t.c;
  });
}
function endPinch() { pinch = null; scr.removeEventListener('touchmove', onPinchMove); }
scr.addEventListener('touchstart', e => {
  if (e.touches.length !== 2) return;
  stopFling();
  const t = two(e); pinch = { d: t.d, d0: t.d, z: curZ(), c: t.c };
  scr.addEventListener('touchmove', onPinchMove, { passive: false });
}, { passive: true });
scr.addEventListener('touchend', e => { if (e.touches.length < 2) endPinch(); }, { passive: true });
scr.addEventListener('touchcancel', endPinch, { passive: true });

// mouse wheel: zooms the close-up (smoothly, around the cursor); on the whole-trail map it scrolls,
// and a strong scroll up there jumps into the close-up
let wheelAcc = 0, wheelFrame = 0, wheelAt: [number, number] = [0, 0], ovPull = 0;
scr.addEventListener('wheel', e => {
  if ((e.target as Element).closest('.rail, .sheet')) return;
  if (!zoomed) {
    if (e.ctrlKey || e.deltaY < 0 && ov.scrollTop <= 0) { e.preventDefault(); ovPull += -e.deltaY; if (ovPull > 120) { ovPull = 0; toggleZoom(); } }
    return;
  }
  e.preventDefault(); stopFling();
  wheelAcc += e.deltaY * (e.deltaMode === 1 ? 33 : 1); wheelAt = [e.clientX - LOCX, e.clientY - LOCY];
  if (!wheelFrame) wheelFrame = requestAnimationFrame(() => { wheelFrame = 0; const k = Math.exp(-wheelAcc * (e.ctrlKey ? .01 : .0018)); wheelAcc = 0; zoomBy(k, wheelAt[0], wheelAt[1]); });
}, { passive: false });

// drag with the mouse to move the map, and it glides on after a quick release (like a finger fling)
// (the pointer is captured once the drag starts, so passing over the HUD or the window edge doesn't drop it,
// and the click that ends a drag doesn't open whatever is under the cursor)
let flingRaf = 0;
const stopFling = () => { cancelAnimationFrame(flingRaf); flingRaf = 0; };
for (const el of [ov, loc]) {
  let drag: { x: number; y: number; l: number; t: number; id: number; moved: boolean; live: boolean; h: [number, number, number][] } | null = null, swallow = false;
  const end = (e?: PointerEvent) => {
    if (!drag) return;
    const d = drag; drag = null; el.style.cursor = '';
    if (!d.moved) return;
    swallow = true; setTimeout(() => { swallow = false; }, 0);
    // fling: the speed over the last ~90 ms, slowing with a 325 ms time constant
    const a = d.h[0], b = d.h[d.h.length - 1];
    if (!e || e.type !== 'pointerup' || a === b || e.timeStamp - b[0] > 100) return;
    let vx = (b[1] - a[1]) / (b[0] - a[0]), vy = (b[2] - a[2]) / (b[0] - a[0]);
    if (Math.hypot(vx, vy) < .25) return;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(40, t - last); last = t;
      el.scrollLeft -= vx * dt; el.scrollTop -= vy * dt;
      const f = Math.exp(-dt / 325); vx *= f; vy *= f;
      flingRaf = Math.hypot(vx, vy) > .02 ? requestAnimationFrame(step) : 0;
    };
    flingRaf = requestAnimationFrame(step);
  };
  el.addEventListener('pointerdown', e => {
    const was = !!flingRaf; stopFling();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop, id: e.pointerId, moved: was, live: false, h: [[e.timeStamp, e.clientX, e.clientY]] };
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!(e.buttons & 1)) { end(); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.live) { if (Math.abs(dx) + Math.abs(dy) < 4) return; drag.live = drag.moved = true; try { el.setPointerCapture(drag.id); } catch { } el.style.cursor = 'grabbing'; }
    el.scrollLeft = drag.l - dx; el.scrollTop = drag.t - dy;
    drag.h.push([e.timeStamp, e.clientX, e.clientY]); while (drag.h.length > 2 && e.timeStamp - drag.h[0][0] > 90) drag.h.shift();
  });
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', () => end());
  el.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('dragstart', e => e.preventDefault());
}

// the stage rail: every planned stage on the right edge; tap one to fly there and open it
const rail = $('rail');
let railKey = '';
function drawRail() {
  const cur = stageAtKm(STAGES, km).n, key = `${cur}|${Math.floor(km)}|${NAMES.size}|${focus}`;
  if (key === railKey || !STAGES.length) return;
  const first = !railKey; railKey = key;
  rail.innerHTML = STAGES.map(s => {
    const cls = (s.n === cur ? 'now' : s.kmEnd <= km ? 'done' : '') + (s.n === focus ? ' sel' : '');
    const name = nameFrom(s.n) && nameTo(s.n) ? ` · ${nameFrom(s.n)} ← ${nameTo(s.n)}` : '';
    return `<button type="button" class="${cls}" data-n="${s.n}" title="קטע ${s.n} · ${fmt1(s.km)} ק&quot;מ${esc(name)}" aria-label="קטע ${s.n}, ${fmt1(s.km)} ק&quot;מ${esc(name)}"${s.n === cur ? ' aria-current="step"' : ''}><b>${s.n}</b><small>${fmt1(s.km)}</small></button>`;
  }).join('');
  const b = (rail.querySelector('.sel') ?? (first ? rail.querySelector('.now') : null)) as HTMLElement | null;
  if (b) requestAnimationFrame(() => { rail.scrollTop = b.offsetTop - rail.clientHeight / 2 + b.offsetHeight / 2; });
}
/** Moves the camera to a stage: inside the close-up when it is there, otherwise on the whole-trail map. */
function flyTo(n: number) {
  const s = STAGES.find(x => x.n === n); if (!s) return;
  const [lon, lat] = pointAtKm(TRAIL, (s.kmStart + s.kmEnd) / 2);
  stopFling();
  if (zoomed) {
    void toggleZoom();
    setTimeout(() => flyTo(n), 600);   // after the zoom-out has finished moving the overview
    return;
  }
  glide(ov, ov.scrollLeft, Y(lat) * K() + PAD - VH * .3);
}
let glideRaf = 0;
function glide(el: HTMLElement, l1: number, t1: number) {
  cancelAnimationFrame(glideRaf);
  const l0 = el.scrollLeft, t0 = el.scrollTop, s0 = performance.now(), T = 650;
  const step = (t: number) => {
    const u = Math.min(1, (t - s0) / T), e = 1 - Math.pow(1 - u, 3);
    el.scrollLeft = l0 + (l1 - l0) * e; el.scrollTop = t0 + (t1 - t0) * e;
    if (u < 1) glideRaf = requestAnimationFrame(step);
  };
  glideRaf = requestAnimationFrame(step);
}
rail.addEventListener('click', e => {
  const n = (e.target as Element).closest('button')?.getAttribute('data-n'); if (!n) return;
  void focusStage(+n);
});

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
  const facts = [`${s.km} ק"מ`, s.hours ? `${s.hours} שעות הליכה` : '', `עלייה ${fmt(gain)} מ'`, s.segs ? `מקטעים רשמיים ${s.segs}` : ''].filter(Boolean);
  // what really happened: the finished day's own numbers, or today so far when this is the stage in progress
  const real: string[] = []; let realTitle = '';
  if (day) {
    realTitle = `בפועל ב-${shortDate(day.date)}`;
    const dk = day.km_end - day.km_start, t = dur(day.first_at, day.last_at);
    real.push(`${fmt1(dk)} ק"מ`, t, day.steps ? `${fmt(day.steps)} צעדים` : '', day.garmin_km ? `לפי השעון ${fmt1(day.garmin_km)} ק"מ` : '');
  } else if (stageAtKm(STAGES, km).n === s.n) {
    const t = todayStats();
    if (t) { realTitle = 'היום עד עכשיו'; real.push(`${fmt1(t.km)} ק"מ`, `עלייה ${fmt(t.up)} מ'`); }
  }
  const pois = POI.filter(p => p.km >= s.kmStart && p.km < s.kmEnd && poiVisible(p));
  const title = nameFrom(s.n) && nameTo(s.n) ? `${nameFrom(s.n)} ← ${nameTo(s.n)}` : nameFrom(s.n) ? `מ${nameFrom(s.n)} והלאה` : nameTo(s.n) ? `קטע ${s.n}: עד ${nameTo(s.n)}` : `קטע ${s.n}`;
  sheetContent.innerHTML = `<h2 id="sheetTitle">${esc(title)}</h2>
    <div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>
    ${SINFO[s.n] ? `<p class="about">${esc(SINFO[s.n])}</p>` : ''}
    ${real.filter(Boolean).length ? `<h3>${esc(realTitle)}</h3><div class="facts">${real.filter(Boolean).map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
    ${profileSVG(s.kmStart, s.kmEnd, km)}
    ${pois.length ? `<div class="poi-list"><h3>בדרך</h3>${pois.map(p => `<div class="poi-item"><b>${esc(p.title)}</b><p>${esc(p.text)}</p></div>`).join('')}</div>` : ''}
    ${mine.map(p => `${p.body ? `<p class="story">${esc(p.body)}</p>` : ''}${p.photos.length ? `<div class="photos">${p.photos.map(ph => `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">`).join('')}</div>` : ''}`).join('') || (s.kmEnd <= km ? '<p class="muted">עוד אין תמונות מהקטע הזה.</p>' : '')}`;
  sheet.classList.add('stage'); sheet.hidden = false;
}

function openPoi(id: string) {
  const p = POI.find(x => x.id === id); if (!p) return;
  sheetContent.innerHTML = `<h2 id="sheetTitle">${esc(p.title)}</h2>
    <div class="facts"><span>ק"מ ${fmt(p.km)} בשביל</span></div>
    <p class="story">${esc(p.text)}</p>`;
  sheet.classList.remove('stage'); sheet.hidden = false;
}
lm.addEventListener('click', e => { const t = e.target as Element, id = t.closest('.poi')?.getAttribute('data-poi'); if (id) return openPoi(id); const n = t.closest('.node')?.getAttribute('data-n'); if (n) void focusStage(+n); });

async function openGuess() {
  const h = await guessHistogram();
  const max = Math.max(1, ...h.map(x => x.n));
  sheetContent.innerHTML = `<h2 id="sheetTitle">מתי חגי יגיע לאילת?</h2>
    <p class="muted">לפי התוכנית: 15 בדצמבר. מה הניחוש שלך?</p>
    <form class="guess" id="gform"><input id="gname" required maxlength="40" placeholder="השם שלך" aria-label="השם שלך"><input id="gdate" type="date" required min="2026-11-20" max="2027-01-31" aria-label="תאריך"><button type="submit">שליחה</button></form>
    <p class="muted" id="gmsg" role="status"></p>
    ${h.length ? `<div class="hist" title="הניחושים">${h.map(x => `<i style="height:${(x.n / max * 100).toFixed(0)}%" title="${x.guess}: ${x.n}"></i>`).join('')}</div><p class="muted">${h.reduce((a, x) => a + x.n, 0)} ניחושים עד עכשיו</p>` : ''}`;
  sheet.classList.remove('stage'); sheet.hidden = false;
  ($('gform') as HTMLFormElement).onsubmit = async e => {
    e.preventDefault();
    const ok = await sendGuess(($('gname') as HTMLInputElement).value.trim(), ($('gdate') as HTMLInputElement).value);
    $('gmsg').textContent = ok ? 'הניחוש נשמר.' : 'הניחוש לא נשמר. נסו שוב בעוד רגע.';
  };
}

$('card').onclick = () => void focusStage(stageAtKm(STAGES, km).n);
ov.addEventListener('click', e => { const n = (e.target as Element).closest('.node')?.getAttribute('data-n'); if (n) void focusStage(+n); });
$('guess').onclick = openGuess;

// replay: the figure walks the finished trail on the overview map. Only the dash offset of the done line and the figure's transform move.
let replaying = false, replayRaf = 0, replayWasZoomed = false, allowZoom = false;
const rb = $('replay') as HTMLButtonElement, rl = $('rlabel');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function dayInfoAt(k: number): string {
  let d: Day | undefined;
  for (const x of days) if (x.km_end > x.km_start + .05 && k <= x.km_end + .01) { d = x; break; }
  if (d) return `יום ${Math.max(1, dayDiff(START_DATE, d.date) + 1)} · ${shortDate(d.date)}`;
  return `יום ${Math.max(1, state?.dayNo ?? 1)} · ${shortDate(israelDate())}`;
}
async function toggleReplay() {
  if (replaying) { stopReplay(); return; }
  if (!state || km <= .05) return;
  replaying = true; replayWasZoomed = zoomed;
  scr.classList.add('replay'); rb.textContent = 'חזרה לשידור';
  if (zoomed) { allowZoom = true; await toggleZoom(); allowZoom = false; await sleep(700); if (!replaying) return; }
  if (zoomed) { stopReplay(); return; }
  runReplay();
}
function runReplay() {
  const me = mapEl.querySelector('#meO'), polys = [...mapEl.querySelectorAll('polyline.doneO')] as SVGPolylineElement[];
  if (!me || !polys.length) { stopReplay(); return; }
  const L = polys[0].getTotalLength(), f = figure(.087, true), target = km;
  me.innerHTML = f.svg; mapEl.classList.add('replaying');
  const meS = (me as HTMLElement).style;
  polys.forEach(p => { p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = String(L); });
  const t0 = performance.now(), DUR = 12000; let lastLbl = '';
  const step = (t: number) => {
    if (!replaying) return;
    const u = Math.min(1, (t - t0) / DUR), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, kr = target * e;
    const off = String(L * (1 - e));
    for (const p of polys) p.style.strokeDashoffset = off;
    const [lon, lat] = pointAtKm(TRAIL, kr), cx = X(lon), cy = Y(lat);
    meS.transform = at(cx - f.w / 2, cy - f.h * f.anchor);
    ov.scrollTop = cy * K() + PAD - VH * .5;
    const lbl = dayInfoAt(kr); if (lbl !== lastLbl) { lastLbl = lbl; rl.textContent = lbl; rl.hidden = false; }
    if (u < 1) replayRaf = requestAnimationFrame(step); else setTimeout(() => { if (replaying) stopReplay(); }, 900);
  };
  replayRaf = requestAnimationFrame(step);
}
function stopReplay() {
  replaying = false; cancelAnimationFrame(replayRaf);
  scr.classList.remove('replay'); mapEl.classList.remove('replaying'); rl.hidden = true; rb.textContent = 'הילוך חוזר';
  ovKey = '';
  void render().then(() => { if (replayWasZoomed && !zoomed) { allowZoom = true; void toggleZoom().finally(() => { allowZoom = false; }); } });
}
rb.onclick = toggleReplay;
$('replayCta').onclick = () => { if (!replaying) void toggleReplay(); };

// rain and snow drops: a fixed handful of elements, shown only by the weather class (CSS animations only)
for (let i = 0; i < 18; i++) {
  const d = document.createElement('i'); d.className = 'drop';
  d.style.left = `${((i * 5.6 + (i % 3) * 1.7) % 100).toFixed(1)}%`;
  d.style.setProperty('--d', `-${((i * 0.37) % 5).toFixed(2)}s`); d.style.setProperty('--t', (0.85 + (i % 5) * 0.09).toFixed(2));
  $('wx').appendChild(d);
}

async function boot() {
  const live = Promise.all([loadPosts(), loadDays(), loadStageNames()]);
  const [t, st, pr, tiles, rm, poi, info] = await Promise.all([
    fetch('./data/trail-lite.json').then(r => r.json()),
    fetch('./data/stages.json').then(r => r.json()),
    fetch('./data/profile.json').then(r => r.json()),
    fetch('./tiles/index.json').then(r => r.ok ? r.json() : { cells: [] }).catch(() => ({ cells: [] })),
    fetch('./map/relief.json').then(r => r.json()),
    fetch('./data/poi.json').then(r => r.ok ? r.json() : { pts: [] }).then(j => j.pts as Poi[]).catch(() => [] as Poi[]),
    fetch('./data/stage-info.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
  ]);
  S = rm.s; LON0 = rm.lon0; LAT0 = rm.lat0; W = rm.w; H = rm.h;
  TRAIL = t.pts; TOTAL = st.totalKm; STAGES = st.stages; DAYS_N = st.walkDays + st.restDays; ELE = pr.ele; GAIN = pr.gain; CELLS = tiles.cells;
  let next = 0; LINE = TRAIL.filter(p => (p[2] >= next ? (next = p[2] + .25, true) : false));
  POI = poi; SINFO = info; measureView();
  [posts, days, NAMES] = await live;
  daysDate = israelDate();
  if (!sb && QS.has('km')) days = STAGES.filter(x => x.kmEnd < +QS.get('km')!).map((x, i) => {   // local dev only: fake finished days
    const d = new Date(Date.parse(START_DATE) + i * 86400000).toISOString().slice(0, 10);
    return { date: d, km_start: x.kmStart, km_end: x.kmEnd, first_at: `${d}T04:10:00Z`, last_at: `${d}T12:45:00Z`, steps: Math.round(x.km * 1350), garmin_km: x.km + .4 };
  });
  let lastStage = 0;
  await watchState(async s => { if (!sb && QS.has('km')) s = { ...s, km: +QS.get('km')!, capKm: +QS.get('km')! + 8, status: (QS.get('st') ?? 'walking') as PublicState['status'], dayNo: 5 };   // local dev only
    state = s; const sg = stageAtKm(STAGES, s.km), n = sg.n * 2 + (s.km >= sg.kmStart + 1 ? 1 : 0); if (n !== lastStage) { lastStage = n; NAMES = await loadStageNames(); } render(); });
  setInterval(render, 60000);
  // ?stage=12 opens that stage's sheet (links shared from outside)
  const qs = +(QS.get('stage') ?? NaN);
  if (STAGES.some(x => x.n === qs)) openStage(qs);
  if (sb) sb.channel('posts').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, async () => { posts = await loadPosts(); render(); }).subscribe();
}
boot();
