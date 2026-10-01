// Receives positions and admin actions, keeps raw coordinates private, publishes the public state.
//   POST ?token=INGEST_TOKEN          Overland / OwnTracks batches from the phone (no login on the phone app)
//   POST  Authorization: Bearer JWT    admin page: {type:'checkin',lat,lon} | {type:'control',action} | {type:'post',...}
import { createClient } from 'npm:@supabase/supabase-js@2';
import trailData from '../_shared/data/trail.json' with { type: 'json' };
import stagesData from '../_shared/data/stages.json' with { type: 'json' };
import { snapToTrail, type TrailPt, type Stage, type PublicState } from '../_shared/trail.ts';
import { computeState, parseBody, type Fix } from '../_shared/state.ts';

const TRAIL = (trailData as { pts: TrailPt[] }).pts;
const STAGES = (stagesData as { stages: Stage[] }).stages;
const START = Deno.env.get('START_DATE') ?? '2026-10-05';
const MAX_OFF_TRAIL_M = 3000;
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function isAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!jwt) return false;
  const { data } = await db.auth.getUser(jwt);
  if (!data.user) return false;
  const { data: a } = await db.from('admins').select('uid').eq('uid', data.user.id).maybeSingle();
  return !!a;
}

async function lastKm(): Promise<number | undefined> {
  const { data } = await db.from('positions').select('km').not('km', 'is', null).order('at', { ascending: false }).limit(1).maybeSingle();
  return data?.km ?? undefined;
}

async function storeFixes(fixes: ReturnType<typeof parseBody>) {
  let hint = await lastKm();
  const rows = fixes.sort((a, b) => a.at - b.at).map(f => {
    const s = snapToTrail(TRAIL, f.lon, f.lat, hint);
    const ok = s.distM <= MAX_OFF_TRAIL_M;
    if (ok) hint = s.km;
    return { at: new Date(f.at).toISOString(), lon: f.lon, lat: f.lat, acc: f.acc, km: ok ? s.km : null, dist_m: s.distM, src: f.src };
  });
  if (rows.length) await db.from('positions').insert(rows);
}

async function publish() {
  const since = new Date(Date.now() - 8 * 3600000).toISOString();
  const [{ data: rows }, { data: ctl }, { data: prevRow }] = await Promise.all([
    db.from('positions').select('at,km').not('km', 'is', null).gte('at', since).order('at'),
    db.from('control').select('manual').eq('id', 1).maybeSingle(),
    db.from('public_state').select('*').eq('id', 1).maybeSingle(),
  ]);
  let fixes: Fix[] = (rows ?? []).map(r => ({ at: Date.parse(r.at), km: r.km }));
  if (!fixes.length) {
    const { data: last } = await db.from('positions').select('at,km').not('km', 'is', null).order('at', { ascending: false }).limit(1).maybeSingle();
    if (last) fixes = [{ at: Date.parse(last.at), km: last.km }];
  }
  const prev: PublicState | null = prevRow ? { km: prevRow.km, at: prevRow.at, pace: prevRow.pace, capKm: prevRow.cap_km, status: prevRow.status, dayNo: prevRow.day_no } : null;
  const s = computeState(fixes, Date.now(), STAGES, START, ctl?.manual ?? null, prev);
  await db.from('public_state').upsert({ id: 1, km: s.km, at: s.at, pace: s.pace, cap_km: s.capKm, status: s.status, day_no: s.dayNo, hidden: s.status === 'hidden', updated_at: new Date().toISOString() });

  // today's row for the journal (published only after the day ends, see RLS)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const dayStart = new Date(Date.parse(today + 'T00:00:00+03:00')).toISOString();
  const { data: dayRows } = await db.from('positions').select('at,km').not('km', 'is', null).gte('at', dayStart).order('at');
  if (dayRows?.length) {
    await db.from('days').upsert({ date: today, km_start: dayRows[0].km, km_end: dayRows[dayRows.length - 1].km, first_at: dayRows[0].at, last_at: dayRows[dayRows.length - 1].at }, { onConflict: 'date' });
  }
  return s;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = new URL(req.url);
  const body = await req.json().catch(() => null);

  const tok = url.searchParams.get('token');
  if (tok) {
    if (tok !== Deno.env.get('INGEST_TOKEN')) return json({ error: 'bad token' }, 401);
    const fixes = parseBody(body);
    await storeFixes(fixes);
    if (fixes.length) {
      // moving again cancels "done for today" automatically the next morning
      const { data: ctl } = await db.from('control').select('manual,set_at').eq('id', 1).maybeSingle();
      if (ctl?.manual === 'camp' && Date.now() - Date.parse(ctl.set_at) > 8 * 3600000) await db.from('control').update({ manual: null, set_at: new Date().toISOString() }).eq('id', 1);
    }
    await publish();
    return json({ result: 'ok' }); // Overland expects exactly this
  }

  if (!(await isAdmin(req))) return json({ error: 'not allowed' }, 401);
  if (body?.type === 'checkin') {
    await storeFixes(parseBody(body));
  } else if (body?.type === 'control') {
    const manual = body.action === 'resume' ? null : body.action;
    if (!['camp', 'rest', 'hidden', null].includes(manual)) return json({ error: 'bad action' }, 400);
    await db.from('control').update({ manual, set_at: new Date().toISOString() }).eq('id', 1);
  } else if (body?.type === 'post') {
    const { data: st } = await db.from('public_state').select('km').eq('id', 1).maybeSingle();
    const photos = Array.isArray(body.photos) ? body.photos.filter((p: unknown) => typeof p === 'string').slice(0, 12) : [];
    await db.from('posts').insert({ body: typeof body.body === 'string' ? body.body.slice(0, 1200) : null, photos, taken_at: body.taken_at ?? null, km: st?.km ?? null });
    return json({ result: 'ok' });
  } else {
    return json({ error: 'unknown request' }, 400);
  }
  return json({ result: 'ok', state: await publish() });
});
