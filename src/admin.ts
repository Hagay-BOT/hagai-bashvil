// The admin page on Hagai's phone: check in, set the state, post photos and a line of text.
// Posts are queued in localStorage when there is no signal and sent when it returns.
import { sb } from './live';

const $ = (id: string) => document.getElementById(id)!;
const FN = (import.meta.env.VITE_SUPABASE_URL as string) + '/functions/v1/ingest';
const QUEUE = 'hb-queue';

async function token() { return (await sb!.auth.getSession()).data.session?.access_token ?? ''; }

async function call(body: unknown) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const LABEL: Record<string, string> = { before: 'עוד לא יצאת', walking: 'הולך', break: 'הפסקה', camp: 'לילה', rest: 'יום מנוחה', hidden: 'מוסתר' };
async function showState() {
  const { data } = await sb!.from('public_state').select('*').eq('id', 1).maybeSingle();
  $('stateMsg').textContent = data ? `${LABEL[data.status] ?? data.status} · ק"מ ${Math.round(data.km)} · עודכן ${new Date(data.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'אין עדיין מצב';
}

function act(id: string, body: () => Promise<unknown> | unknown, done: string) {
  const b = $(id) as HTMLButtonElement;
  b.onclick = async () => {
    b.disabled = true;
    try { await call(await body()); $('stateMsg').textContent = done; setTimeout(showState, 1500); }
    catch { $('stateMsg').textContent = 'לא נשלח. אין קליטה, או שהכניסה פגה. נסה שוב.'; }
    finally { b.disabled = false; }
  };
}

function where(): Promise<{ lat: number; lon: number; acc: number }> {
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(
    p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }), rej, { enableHighAccuracy: true, timeout: 20000 }));
}

/** Resize to 1600 px and re-encode: smaller upload, and the JPEG loses its EXIF (including GPS). */
async function shrink(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r(b!), 'image/jpeg', .82));
}
const toDataUrl = (b: Blob) => new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(b); });

interface Draft { id: string; body: string; photos: string[]; at: string }
function queue(): Draft[] { try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch { return []; } }
function saveQueue(q: Draft[]) { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* storage full: keep in memory only */ } }

async function flush() {
  const q = queue();
  if (!q.length || !navigator.onLine) return;
  const rest: Draft[] = [];
  for (const d of q) {
    try {
      const paths: string[] = [];
      for (const [i, url] of d.photos.entries()) {
        const blob = await (await fetch(url)).blob();
        const path = `${d.at.slice(0, 10)}/${d.id}-${i}.jpg`;
        const { error } = await sb!.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        paths.push(path);
      }
      await call({ type: 'post', body: d.body, photos: paths, taken_at: d.at });
    } catch { rest.push(d); }
  }
  saveQueue(rest);
  $('sendMsg').textContent = rest.length ? `${rest.length} עדכונים מחכים לקליטה ויישלחו לבד.` : 'פורסם.';
}

let started = false;
async function startApp() {
  if (started) return; started = true;
  $('login').hidden = true; $('app').hidden = false;
  showState();
  act('here', async () => ({ type: 'checkin', ...(await where()) }), 'המיקום נשלח.');
  act('camp', () => ({ type: 'control', action: 'camp' }), 'לילה טוב. הדמות נכנסה לאוהל.');
  act('rest', () => ({ type: 'control', action: 'rest' }), 'יום מנוחה מסומן.');
  act('hide', () => ({ type: 'control', action: 'hidden' }), 'הדמות מוסתרת עד שתלחץ «ממשיך ללכת».');
  act('resume', () => ({ type: 'control', action: 'resume' }), 'בהצלחה בדרך.');
  ($('copyUrl') as HTMLButtonElement).onclick = async () => {
    try { const { url } = await call({ type: 'overland-url' }); await navigator.clipboard.writeText(url); $('copyUrl').textContent = 'הועתק'; }
    catch { $('copyUrl').textContent = 'ההעתקה נכשלה. נסה שוב.'; }
  };
  const files = $('files') as HTMLInputElement;
  files.onchange = () => { $('thumbs').replaceChildren(...[...files.files ?? []].map(f => Object.assign(document.createElement('img'), { src: URL.createObjectURL(f), alt: '' }))); };
  ($('send') as HTMLButtonElement).onclick = async () => {
    const body = ($('body') as HTMLTextAreaElement).value.trim();
    const list = [...files.files ?? []];
    if (!body && !list.length) { $('sendMsg').textContent = 'אין מה לפרסם: הוסף תמונה או כתוב שורה.'; return; }
    $('sendMsg').textContent = 'מכין…';
    const photos = await Promise.all(list.map(async f => toDataUrl(await shrink(f))));
    const q = queue(); q.push({ id: crypto.randomUUID(), body, photos, at: new Date().toISOString() }); saveQueue(q);
    ($('body') as HTMLTextAreaElement).value = ''; files.value = ''; $('thumbs').replaceChildren();
    await flush();
  };
  addEventListener('online', flush);
  flush();
}

async function boot() {
  if (!sb) { document.querySelector('main')!.insertAdjacentHTML('beforeend', '<p class="msg">האתר עוד לא מחובר לשרת.</p>'); return; }
  if ((await sb.auth.getSession()).data.session) return startApp();
  $('login').hidden = false;
  ($('loginForm') as HTMLFormElement).onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb!.auth.signInWithOtp({ email: ($('email') as HTMLInputElement).value.trim(), options: { emailRedirectTo: location.href.split('#')[0] } });
    if (error) { $('loginMsg').textContent = 'השליחה נכשלה. אולי נשלחו יותר מדי קודים; נסה שוב בעוד כמה דקות.'; return; }
    $('loginMsg').textContent = 'נשלח קישור למייל. לוחצים עליו לחיצה ארוכה ← «פתח ב-Safari», כדי שהכניסה תישמר בדפדפן הזה.';
  };
  sb.auth.onAuthStateChange((_e, session) => { if (session) startApp(); });
}
boot();
