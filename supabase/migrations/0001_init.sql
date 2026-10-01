-- «חגי בשביל» · schema
-- Privacy rule: raw coordinates live only in `positions`, which has no policies at all
-- (service role only). Visitors read `public_state`, which carries km on the trail, never lon/lat.

create table if not exists positions (
  id       bigserial primary key,
  at       timestamptz not null,
  lon      double precision not null,
  lat      double precision not null,
  acc      real,
  km       real,            -- snapped km on the trail, null when too far from it
  dist_m   integer,         -- offset from the trail
  src      text not null default 'overland',
  created_at timestamptz not null default now()
);
create index if not exists positions_at_idx on positions (at desc);
alter table positions enable row level security;

create table if not exists public_state (
  id       smallint primary key default 1 check (id = 1),
  km       real not null default 0,
  at       timestamptz not null default now(),
  pace     real not null default 3,
  cap_km   real not null default 0,
  status   text not null default 'before' check (status in ('before','walking','break','camp','rest','hidden')),
  day_no   smallint not null default 0,
  hidden   boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public_state (id) values (1) on conflict do nothing;
alter table public_state enable row level security;
create policy "state is public" on public_state for select using (true);

create table if not exists days (
  date      date primary key,
  km_start  real not null,
  km_end    real not null,
  first_at  timestamptz,
  last_at   timestamptz,
  steps     integer,
  garmin_km real
);
alter table days enable row level security;
-- today's row would reveal where the night camp is, so only finished days are public
create policy "finished days are public" on days for select using (date < (now() at time zone 'Asia/Jerusalem')::date);

create table if not exists admins (uid uuid primary key references auth.users on delete cascade);
alter table admins enable row level security;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where uid = auth.uid()) $$;

create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  taken_at   timestamptz,
  km         real,
  body       text check (char_length(body) <= 1200),
  photos     text[] not null default '{}',
  published  boolean not null default true
);
alter table posts enable row level security;
create policy "published posts are public" on posts for select using (published or is_admin());
create policy "admin writes posts" on posts for all using (is_admin()) with check (is_admin());

create table if not exists cheers (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) between 1 and 40),
  message    text check (char_length(message) <= 280)
);
alter table cheers enable row level security;
create policy "anyone can cheer" on cheers for insert with check (true);
create policy "admin reads cheers" on cheers for select using (is_admin());
create policy "admin deletes cheers" on cheers for delete using (is_admin());
create or replace function cheer_count() returns bigint language sql stable security definer set search_path = public as
$$ select count(*) from cheers $$;

create table if not exists guesses (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) between 1 and 40),
  guess      date not null check (guess between date '2026-10-05' and date '2027-03-31')
);
alter table guesses enable row level security;
create policy "anyone can guess" on guesses for insert with check (true);
create policy "admin reads guesses" on guesses for select using (is_admin());
create or replace function guess_histogram() returns table (guess date, n bigint) language sql stable security definer set search_path = public as
$$ select guess, count(*) from guesses group by guess order by guess $$;

grant execute on function cheer_count() to anon, authenticated;
grant execute on function guess_histogram() to anon, authenticated;

alter publication supabase_realtime add table public_state;
alter publication supabase_realtime add table posts;

insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict do nothing;
create policy "photos are public" on storage.objects for select using (bucket_id = 'photos');
create policy "admin uploads photos" on storage.objects for insert with check (bucket_id = 'photos' and is_admin());
create policy "admin deletes photos" on storage.objects for delete using (bucket_id = 'photos' and is_admin());
