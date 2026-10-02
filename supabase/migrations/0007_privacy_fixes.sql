-- Red-team fixes: nothing public may point at where Hagai sleeps tonight.

-- 1. stage_names: `name_to` of the current stage is tonight's place. Visitors read only where stages start,
--    and a start is shown only once the public figure is 1 km past it (not at the moment he arrives).
revoke select on stage_names from anon, authenticated;
grant select (n, name_from, km_start) on stage_names to anon, authenticated;
drop policy if exists "reached stages are public" on stage_names;
create policy "passed stages are public" on stage_names for select
  using (n = 1 or km_start + 1 <= (select km from public_state where id = 1));

-- 2. days: km_end is the night stop. A day is public only after it ended AND the public figure has
--    already walked past where it ended (so a rest day or the night after never reveals it).
drop policy if exists "finished days are public" on days;
create policy "passed days are public" on days for select using (
  date < (now() at time zone 'Asia/Jerusalem')::date
  and (km_end is null
       or km_end + 0.1 <= (select km from public_state where id = 1)
       or (select status from public_state where id = 1) = 'finished'));

-- 3, 5, 10. new public statuses
alter table public_state drop constraint if exists public_state_status_check;
alter table public_state add constraint public_state_status_check
  check (status in ('before','walking','break','camp','rest','hidden','nosignal','finished'));

-- 3. "done for today" remembers where it was pressed and clears once he walked 300 m from there
alter table control add column if not exists km real;

-- 7. a post written at the night stop shows its pin only the next day
alter table posts add column if not exists hold boolean not null default false;

-- 8. snapped km of a fix rejected as a GPS jump (km stays null, so nothing public uses it)
alter table positions add column if not exists snap_km real;

-- 5. recompute the public state every 5 minutes, so a silent phone never stays "walking"
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('publish-tick', '*/5 * * * *',
  $$ select net.http_post(url := 'https://ovsunxpzzhchrkymzbfo.supabase.co/functions/v1/ingest?tick=1',
                          body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb) $$);
