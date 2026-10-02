// Live data: Supabase when configured, otherwise a "before the start" state so the site still works.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicState } from '../supabase/functions/_shared/trail';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const START_DATE = '2026-10-05';

export const sb: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null;

export interface Post { id: string; created_at: string; taken_at: string | null; km: number | null; body: string | null; photos: string[]; hold: boolean }
export interface Day { date: string; km_start: number; km_end: number; first_at: string | null; last_at: string | null; steps: number | null; garmin_km: number | null }

const toState = (r: any): PublicState => ({ km: r.km, at: r.at, pace: r.pace, capKm: r.cap_km, status: r.status, dayNo: r.day_no });

export function beforeStart(): PublicState {
  return { km: 0, at: new Date().toISOString(), pace: 3, capKm: 14.5, status: 'before', dayNo: 0 };
}

/** Calls `onState` now and on every change. */
export async function watchState(onState: (s: PublicState) => void): Promise<void> {
  if (!sb) { onState(beforeStart()); return; }
  const load = async () => {
    const { data } = await sb!.from('public_state').select('*').eq('id', 1).maybeSingle();
    onState(data ? toState(data) : beforeStart());
  };
  await load();
  sb.channel('state').on('postgres_changes', { event: '*', schema: 'public', table: 'public_state' }, p => onState(toState(p.new))).subscribe();
  // safety net when the realtime socket sleeps (phones in background)
  setInterval(load, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}

export async function loadPosts(): Promise<Post[]> {
  if (!sb) return [];
  const { data } = await sb.from('posts').select('id,created_at,taken_at,km,body,photos,hold').order('created_at');
  return (data as Post[]) ?? [];
}

export async function loadDays(): Promise<Day[]> {
  if (!sb) return [];
  const { data } = await sb.from('days').select('*').order('date');
  return (data as Day[]) ?? [];
}

export function photoUrl(path: string): string {
  return sb ? sb.storage.from('photos').getPublicUrl(path).data.publicUrl : '';
}

export async function sendGuess(name: string, guess: string): Promise<boolean> {
  if (!sb) return false;
  const { error } = await sb.from('guesses').insert({ name, guess });
  return !error;
}

export async function guessHistogram(): Promise<{ guess: string; n: number }[]> {
  if (!sb) return [];
  const { data } = await sb.rpc('guess_histogram');
  return (data as { guess: string; n: number }[]) ?? [];
}

/** Names of the stages he already reached: n -> from. */
export async function loadStageNames(): Promise<Map<number, string>> {
  const m = new Map<number, string>([[1, 'קופות החרמון']]);
  if (!sb) return m;
  const { data } = await sb.from('stage_names').select('n,name_from');
  for (const r of data ?? []) m.set(r.n, r.name_from);
  return m;
}
