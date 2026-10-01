-- Admins are identified by the email they sign in with (magic link, no password).
-- The address itself is seeded privately and never committed.
create table if not exists admin_emails (email text primary key);
alter table admin_emails enable row level security;

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admin_emails where lower(email) = lower(auth.jwt() ->> 'email')) $$;
