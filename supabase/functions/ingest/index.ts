// Receives positions and admin actions, keeps raw coordinates private, publishes the public state.
//   POST ?token=INGEST_TOKEN          Overland / OwnTracks batches from the phone (no login on the phone app)
//   POST ?tick=1                       every 5 minutes from pg_cron: recompute the public state (no input, no secret)
//   POST  Authorization: Bearer JWT    admin page: {type:'checkin',lat,lon} | {type:'control',action} | {type:'post',...}
import { createClient } from 'npm:@supabase/supabase-js@2';
import trailData from '../_shared/data/trail.json' with { type: 'json' };
import stagesData from '../_shared/data/stages.json' with { type: 'json' };
import { snapToTrail, israelHour, type TrailPt, type Stage, type PublicState } from '../_shared/trail.ts';
import { computeState, parseBody, dayNo, acceptFix, restExpired, israelDate, israelMidnightMs, CAMP_BACKOFF_MIN, CAMP_CLEAR_KM, type Fix } from '../_shared/state.ts';

const TRAIL = (trailData as { pts: TrailPt[] }).pts;
const STAGES = (stagesData as { stages: Stage[] }).stages;
const START = Deno.env.get('START_DATE') ?? '2026-10-05';
const MAX_OFF_TRAIL_M = Number(Deno.env.get('MAX_OFF_TRAIL_M') ?? 3000);
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function isAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!jwt) return false;
  const { data } = await db.auth.getUser(jwt);
  if (!data.user) return false;
  const { data: a } = await db.from('admin_emails').select('email').eq('email', (data.user.email ?? '').toLowerCase()).maybeSingle();
  return !!a;
}

/** Failed requests are logged at most once a minute, so a stranger cannot flood the log. */
async function logRefused(note: string) {
  const { data } = await db.from('ingest_log').select('id').is('received', null).gte('at', new Date(Date.now() - 60000).toISOString()).limit(1);
  if (!data?.length) await db.from('ingest_log').insert({ received: null, kept: 0, note });
}

async function lastFix(): Promise<Fix | undefined> {
  const { data } = await db.from('positions').select('at,km').not('km', 'is', null).order('at', { ascending: false }).limit(1).maybeSingle();
  return data ? { at: Date.parse(data.at), km: data.km } : undefined;
}

async function storeFixes(fixes: ReturnType<typeof parseBody>) {
  if (!fixes.length) return;
  const last = await lastFix();
  // fixes rejected since the last accepted one: if new ones agree with them, it was a real move
  const { data: rej } = last
    ? await db.from('positions').select('at,snap_km').is('km', null).not('snap_km', 'is', null).gt('at', new Date(last.at).toISOString()).order('at').limit(50)
    : { data: [] };
  const st = { last, pending: (rej ?? []).map(r => ({ at: Date.parse(r.at), km: r.snap_km as number })) };
  const rows = fixes.sort((a, b) => a.at - b.at).map(f => {
    const s = snapToTrail(TRAIL, f.lon, f.lat, st.last?.km);
    const near = s.distM <= MAX_OFF_TRAIL_M;
    // a jump faster than walking is kept with km = null, so nothing public moves
    const ok = near && acceptFix(st, { at: f.at, km: s.km });
    return { at: new Date(f.at).toISOString(), lon: f.lon, lat: f.lat, acc: f.acc, km: ok ? s.km : null, snap_km: near ? s.km : null, dist_m: s.distM, src: f.src };
  });
  await db.from('positions').insert(rows);
}

/** Clears a manual state that has run its course: "done for today" once he walked on, a rest day the next morning. */
async function settleControl() {
  const { data: ctl } = await db.from('control').select('manual,set_at,km').eq('id', 1).maybeSingle();
  if (!ctl) return;
  if (ctl.manual === 'camp') {
    const k = (await lastFix())?.km;
    if (k === undefined) return;
    if (ctl.km == null) await db.from('control').update({ km: k }).eq('id', 1);
    else if (Math.abs(k - ctl.km) > CAMP_CLEAR_KM) await db.from('control').update({ manual: null, km: null, set_at: new Date().toISOString() }).eq('id', 1);
  } else if (ctl.manual === 'rest' && restExpired(Date.parse(ctl.set_at), Date.now())) {
    await db.from('control').update({ manual: null, set_at: new Date().toISOString() }).eq('id', 1);
  }
}

async function publish() {
  await settleControl();
  // the latest 1000 on-trail fixes (the API returns at most 1000 rows), oldest first
  const [{ data: rows }, { data: ctl }, { data: prevRow }] = await Promise.all([
    db.from('positions').select('at,km').not('km', 'is', null).order('at', { ascending: false }).limit(1000),
    db.from('control').select('manual').eq('id', 1).maybeSingle(),
    db.from('public_state').select('*').eq('id', 1).maybeSingle(),
  ]);
  const fixes: Fix[] = (rows ?? []).map(r => ({ at: Date.parse(r.at), km: r.km })).reverse();
  const prev: PublicState | null = prevRow ? { km: prevRow.km, at: prevRow.at, pace: prevRow.pace, capKm: prevRow.cap_km, status: prevRow.status, dayNo: prevRow.day_no } : null;
  const s = computeState(fixes, Date.now(), STAGES, START, ctl?.manual ?? null, prev);
  await db.from('public_state').upsert({ id: 1, km: s.km, at: s.at, pace: s.pace, cap_km: s.capKm, status: s.status, day_no: s.dayNo, hidden: s.status === 'hidden', updated_at: new Date().toISOString() });

  // today's row for the journal (public only once the figure has passed where the day ended, see RLS)
  const today = israelDate(Date.now());
  const dayStart = new Date(israelMidnightMs(today)).toISOString();
  const { data: dayRows } = await db.from('positions').select('at,km').not('km', 'is', null).gte('at', dayStart).order('at');
  if (dayRows?.length) {
    await db.from('days').upsert({ date: today, km_start: dayRows[0].km, km_end: dayRows[dayRows.length - 1].km, first_at: dayRows[0].at, last_at: dayRows[dayRows.length - 1].at }, { onConflict: 'date' });
  }
  return s;
}

/** Km for a post: where he was 45 minutes before it was written, and never ahead of the public figure. */
async function postKm(takenMs: number): Promise<number | null> {
  const [{ data: st }, { data: back }] = await Promise.all([
    db.from('public_state').select('km,status').eq('id', 1).maybeSingle(),
    db.from('positions').select('km').not('km', 'is', null).lte('at', new Date(takenMs - CAMP_BACKOFF_MIN * 60000).toISOString()).order('at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!st || st.status === 'before') return null;
  const ks = [st.km, back?.km].filter((k): k is number => typeof k === 'number');
  return ks.length ? Math.min(...ks) : null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = new URL(req.url);

  if (url.searchParams.has('tick')) {
    // recompute so that a silent phone turns into "no signal" or the camp; at most once a minute
    const { data: ps } = await db.from('public_state').select('updated_at').eq('id', 1).maybeSingle();
    if (ps && Date.now() - Date.parse(ps.updated_at) < 60000) return json({ result: 'ok' });
    await publish();
    return json({ result: 'ok' });
  }

  const body = await req.json().catch(() => null);
  const tok = url.searchParams.get('token');
  if (tok) {
    if (tok !== Deno.env.get('INGEST_TOKEN')) {
      await logRefused(`bad token (length ${tok.length})`);
      return json({ error: 'bad token' }, 401);
    }
    // before the start nothing is kept: no home locations pile up in the database
    if (dayNo(Date.now(), START) === 0) return json({ result: 'ok' });
    const fixes = parseBody(body);
    const raw = Array.isArray(body?.locations) ? body.locations : body ? [body] : [];
    const accs = raw.map((l: any) => +(l?.properties?.horizontal_accuracy ?? l?.acc ?? NaN)).filter((n: number) => isFinite(n));
    await db.from('ingest_log').insert({ received: raw.length, kept: fixes.length, max_acc: accs.length ? Math.max(...accs) : null, note: body ? Object.keys(body).slice(0, 5).join(',') : 'no json body' });
    await storeFixes(fixes);
    await publish();
    return json({ result: 'ok' }); // Overland expects exactly this
  }

  if (!(await isAdmin(req))) {
    await logRefused(`no token, not admin (${req.headers.get('user-agent')?.slice(0, 40) ?? ''})`);
    return json({ error: 'not allowed' }, 401);
  }
  if (body?.type === 'overland-url') {
    return json({ url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest?token=${Deno.env.get('INGEST_TOKEN')}` });
  }
  if (body?.type === 'checkin') {
    if (dayNo(Date.now(), START) === 0) return json({ result: 'ok', state: await publish() });
    await storeFixes(parseBody(body));
  } else if (body?.type === 'control') {
    const manual = body.action === 'resume' ? null : body.action;
    if (!['camp', 'rest', 'hidden', null].includes(manual)) return json({ error: 'bad action' }, 400);
    const km = manual === 'camp' ? (await lastFix())?.km ?? null : null;
    await db.from('control').update({ manual, km, set_at: new Date().toISOString() }).eq('id', 1);
  } else if (body?.type === 'post') {
    const t = Date.parse(body.taken_at ?? '');
    const takenMs = isFinite(t) && t <= Date.now() ? t : Date.now();
    const { data: st } = await db.from('public_state').select('status').eq('id', 1).maybeSingle();
    const h = israelHour(takenMs);
    // written at the night stop: the pin waits for the next day
    const hold = ['camp', 'rest', 'nosignal'].includes(st?.status ?? '') || h >= 17 || h < 9;
    const photos = Array.isArray(body.photos) ? body.photos.filter((p: unknown) => typeof p === 'string').slice(0, 12) : [];
    const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : crypto.randomUUID();
    const { error } = await db.from('posts').upsert({ id, body: typeof body.body === 'string' ? body.body.slice(0, 1200) : null, photos, taken_at: new Date(takenMs).toISOString(), km: await postKm(takenMs), hold }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return json({ error: 'post not saved' }, 500);
    return json({ result: 'ok' });
  } else {
    return json({ error: 'unknown request' }, 400);
  }
  return json({ result: 'ok', state: await publish() });
});
