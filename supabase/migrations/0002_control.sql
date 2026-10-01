-- What the admin page last asked for: 'camp', 'rest', 'hidden', or null (walking normally).
-- Service role only.
create table if not exists control (
  id      smallint primary key default 1 check (id = 1),
  manual  text check (manual in ('camp','rest','hidden')),
  set_at  timestamptz not null default now()
);
insert into control (id) values (1) on conflict do nothing;
alter table control enable row level security;
