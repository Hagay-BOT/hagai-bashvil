// The admin page on Hagai's phone: check in, set the state, post photos and a line of text.
// Posts are kept in IndexedDB (photos as blobs) until they are sent, so nothing is lost without signal.
import { sb } from './live';

const $ = (id: string) => document.getElementById(id)!;
const FN = (import.meta.env.VITE_SUPABASE_URL as string) + '/functions/v1/ingest';
const OLD_QUEUE = 'hb-queue';   // drafts of the first version lived in localStorage

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

// drafts: { id (also posts.id and the photo file names), body, at, photos: Blob[] }
interface Draft { id: string; body: string; photos: Blob[]; at: string }
let dbp: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('hb-drafts', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
}
async function store<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('drafts', mode), req = fn(tx.objectStore('drafts'));
    tx.oncomplete = () => res(req.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
const allDrafts = () => store<Draft[]>('readonly', s => s.getAll() as IDBRequest<Draft[]>);
const putDraft = (d: Draft) => store('readwrite', s => s.put(d));
const dropDraft = (id: string) => store('readwrite', s => s.delete(id));

/** Moves drafts left in localStorage by the first version into IndexedDB. */
async function migrateOld() {
  let old: { id: string; body: string; photos: string[]; at: string }[] = [];
  try { old = JSON.parse(localStorage.getItem(OLD_QUEUE) || '[]'); } catch { return; }
  for (const d of old) await putDraft({ id: d.id, body: d.body, at: d.at, photos: await Promise.all(d.photos.map(async u => (await fetch(u)).blob())) });
  localStorage.removeItem(OLD_QUEUE);
}

/** An upload that already happened on an earlier try counts as done. */
const alreadyThere = (e: { message?: string; statusCode?: string } | null) => !!e && (e.statusCode === '409' || /exists|duplicate/i.test(e.message ?? ''));

let flushing = false, again = false;
async function flush() {
  if (flushing) { again = true; return; }
  flushing = true;
  try {
    do {
      again = false;
      if (!navigator.onLine) break;
      let left = 0;
      for (const d of await allDrafts()) {
        try {
          const paths: string[] = [];
          for (const [i, blob] of d.photos.entries()) {
            const path = `${d.at.slice(0, 10)}/${d.id}-${i}.jpg`;
            const { error } = await sb!.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
            if (error && !alreadyThere(error)) throw error;
            paths.push(path);
          }
          await call({ type: 'post', id: d.id, body: d.body, photos: paths, taken_at: d.at });
          await dropDraft(d.id);
        } catch { left++; }
      }
      $('sendMsg').textContent = left ? `${left} עדכונים מחכים לקליטה ויישלחו לבד.` : 'פורסם.';
    } while (again);
  } catch { $('sendMsg').textContent = 'העדכונים שמורים בטלפון ויישלחו כשתהיה קליטה.'; }
  finally { flushing = false; }
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
    let url = '';
    try { url = (await call({ type: 'overland-url' })).url; } catch { $('copyUrl').textContent = 'לא התקבלה כתובת. נסה שוב.'; return; }
    const box = $('urlBox') as HTMLTextAreaElement; box.value = url; box.hidden = false; box.focus(); box.select();
    try { await navigator.clipboard.writeText(url); $('copyUrl').textContent = 'הועתק. אם לא, מעתיקים ידנית מהתיבה'; }
    catch { $('copyUrl').textContent = 'מעתיקים ידנית מהתיבה שמתחת'; }
  };
  ($('setPw') as HTMLButtonElement).onclick = async () => {
    const pw = ($('newPw') as HTMLInputElement).value;
    if (pw.length < 8) { $('pwMsg').textContent = 'לפחות 8 תווים.'; return; }
    const { error } = await sb!.auth.updateUser({ password: pw });
    $('pwMsg').textContent = error ? 'השמירה נכשלה. נסה שוב.' : 'נשמר. מעכשיו נכנסים עם המייל והסיסמה.';
    ($('newPw') as HTMLInputElement).value = '';
  };
  const files = $('files') as HTMLInputElement;
  files.onchange = () => { $('thumbs').replaceChildren(...[...files.files ?? []].map(f => Object.assign(document.createElement('img'), { src: URL.createObjectURL(f), alt: '' }))); };
  const send = $('send') as HTMLButtonElement;
  send.onclick = async () => {
    const body = ($('body') as HTMLTextAreaElement).value.trim();
    const list = [...files.files ?? []];
    if (!body && !list.length) { $('sendMsg').textContent = 'אין מה לפרסם: הוסף תמונה או כתוב שורה.'; return; }
    send.disabled = true;
    $('sendMsg').textContent = 'מכין…';
    try {
      const photos = await Promise.all(list.map(shrink));
      await putDraft({ id: crypto.randomUUID(), body, photos, at: new Date().toISOString() });
    } catch {
      $('sendMsg').textContent = 'לא נשמר בטלפון. נסה שוב.';
      return;
    } finally { send.disabled = false; }
    ($('body') as HTMLTextAreaElement).value = ''; files.value = ''; $('thumbs').replaceChildren();
    await flush();
  };
  addEventListener('online', flush);
  migrateOld().catch(() => {}).finally(flush);
}

async function boot() {
  if (!sb) { document.querySelector('main')!.insertAdjacentHTML('beforeend', '<p class="msg">האתר עוד לא מחובר לשרת.</p>'); return; }
  if ((await sb.auth.getSession()).data.session) return startApp();
  $('login').hidden = false;
  if (location.hash.includes('error_code=otp_expired')) { $('loginMsg').textContent = 'הקישור כבר נוצל או שפג תוקפו. שלחו קישור חדש ולחצו עליו פעם אחת, בלי לחיצה ארוכה.'; history.replaceState(null, '', location.pathname); }
  const email = () => ($('email') as HTMLInputElement).value.trim();
  ($('loginForm') as HTMLFormElement).onsubmit = async e => {
    e.preventDefault();
    const password = ($('password') as HTMLInputElement).value;
    if (!password) { $('loginMsg').textContent = 'הקלד סיסמה, או לחץ «שלחו לי קישור למייל».'; return; }
    const { error } = await sb!.auth.signInWithPassword({ email: email(), password });
    $('loginMsg').textContent = error ? 'המייל או הסיסמה לא נכונים.' : '';
  };
  ($('sendLink') as HTMLButtonElement).onclick = async () => {
    if (!email()) { $('loginMsg').textContent = 'הקלד קודם את המייל.'; return; }
    const { error } = await sb!.auth.signInWithOtp({ email: email(), options: { emailRedirectTo: location.href.split('#')[0] } });
    $('loginMsg').textContent = error ? 'השליחה נכשלה. נסה שוב בעוד כמה דקות.' : 'נשלח קישור למייל. לוחצים עליו, ובדף שנפתח קובעים סיסמה.';
  };
  sb.auth.onAuthStateChange((_e, session) => { if (session) startApp(); });
}
boot();
