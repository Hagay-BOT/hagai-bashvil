-- What arrived from the phone, without coordinates: for debugging the tracking app. Service role only.
create table if not exists ingest_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  received int, kept int, max_acc real, note text
);
alter table ingest_log enable row level security;
