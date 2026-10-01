-- Stage names reveal where Hagai sleeps, so they are not in the public files.
-- A row is visible once he reached the start of that stage. The destination of the current
-- stage is the next row's name_from, so tonight's place appears only after he arrives.
create table if not exists stage_names (
  n         smallint primary key,
  name_from text not null,
  name_to   text not null,
  km_start  real not null
);
alter table stage_names enable row level security;
create policy "reached stages are public" on stage_names for select
  using (km_start <= (select km from public_state where id = 1) + 0.05);
-- the seed (data-private/stage_names.sql) is applied by hand and never committed
