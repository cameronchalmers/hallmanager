-- ============================================================
-- HallManager — Migrations
-- Run these against an existing database to bring it up to date.
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS / DO blocks).
-- ============================================================

-- ── app_settings: key/value store for global toggles ─────────────────────────
create table if not exists public.app_settings (
  key   text primary key,
  value jsonb not null
);
alter table public.app_settings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'app_settings' and policyname = 'app_settings: admin read/write') then
    create policy "app_settings: admin read/write" on public.app_settings
      for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
  end if;
end $$;
-- Default: reminders enabled
insert into public.app_settings (key, value) values ('reminders_enabled', 'true') on conflict do nothing;

-- ── sites: add extended columns ───────────────────────────────────────────────
alter table public.sites add column if not exists min_hours       numeric(5,2);
alter table public.sites add column if not exists available_from  time;
alter table public.sites add column if not exists available_until time;
alter table public.sites add column if not exists availability    jsonb;
alter table public.sites add column if not exists description     text;
alter table public.sites add column if not exists amenities       text[];
alter table public.sites add column if not exists photos          text[];

-- ── users: add group_name ─────────────────────────────────────────────────────
alter table public.users add column if not exists group_name text;

-- ── bookings: add recurrence_days for multi-day weekly bookings ──────────────
alter table public.bookings add column if not exists recurrence_days integer[];

-- ── bookings: add Stripe + attendance + recurring columns ─────────────────────
alter table public.bookings add column if not exists stripe_session_id     text;
alter table public.bookings add column if not exists stripe_payment_url    text;
alter table public.bookings add column if not exists stripe_payment_status text;
alter table public.bookings add column if not exists attended              boolean;
alter table public.bookings add column if not exists session_attendance    jsonb;
alter table public.bookings add column if not exists cancelled_sessions    text[] default '{}';

-- ── bookings: add 'approved' to status check ─────────────────────────────────
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending','approved','confirmed','denied','cancelled'));

-- ── extra_slots: add 'cancelled' to status check ─────────────────────────────
alter table public.extra_slots drop constraint if exists extra_slots_status_check;
alter table public.extra_slots add constraint extra_slots_status_check
  check (status in ('pending','approved','denied','cancelled'));

-- ── bookings: add approved_at column ─────────────────────────────────────────
alter table public.bookings add column if not exists approved_at timestamptz;

-- ── bookings: trigger to set approved_at automatically ───────────────────────
create or replace function public.set_approved_at()
returns trigger language plpgsql as $$
begin
  if NEW.status = 'approved' and (OLD.status is null or OLD.status != 'approved') then
    NEW.approved_at = now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists bookings_approved_at on public.bookings;
create trigger bookings_approved_at
  before update on public.bookings
  for each row execute function public.set_approved_at();

-- ── pg_cron: daily booking reminder job ──────────────────────────────────────
-- Runs at 9am UTC each day. Sends a reminder email to anyone with a confirmed
-- one-off booking tomorrow.
-- Replace <YOUR_PROJECT_REF> and <YOUR_SERVICE_ROLE_KEY> with real values.
--
-- select cron.schedule(
--   'send-booking-reminders',
--   '0 9 * * *',
--   $$
--   select net.http_post(
--     url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-reminder',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- ── pg_cron: daily auto-cancel job ───────────────────────────────────────────
-- Requires pg_cron and pg_net extensions to be enabled in Supabase.
-- Replace <YOUR_PROJECT_REF> and <YOUR_SERVICE_ROLE_KEY> with real values,
-- or set them as database settings via Supabase dashboard.
--
-- select cron.schedule(
--   'auto-cancel-overdue-bookings',
--   '0 9 * * *',
--   $$
--   select net.http_post(
--     url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/auto-cancel',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- ── RLS: tighten users update policy (block self-role-escalation) ────────────
do $$ begin
  -- Drop old permissive policy and replace with role-locked version
  drop policy if exists "users: update own row" on public.users;
  create policy "users: update own row"
    on public.users for update
    to authenticated
    using (id = auth.uid() or public.is_admin_or_manager())
    with check (
      public.is_admin_or_manager()
      or (id = auth.uid() and role = (select role from public.users where id = auth.uid()))
    );
end $$;

-- ── RLS: tighten anon insert on bookings (prevent field injection) ────────────
do $$ begin
  drop policy if exists "bookings: anon insert" on public.bookings;
  create policy "bookings: anon insert"
    on public.bookings for insert
    to anon
    with check (
      status = 'pending'
      and stripe_payment_status is null
      and stripe_session_id is null
      and user_id is null
    );
end $$;

-- ── RLS: invoices visible via booking ownership (not just user_id) ──────────
do $$ begin
  drop policy if exists "invoices: read own or admin" on public.invoices;
  create policy "invoices: read own or admin"
    on public.invoices for select
    to authenticated
    using (
      public.is_admin_or_manager()
      or user_id = auth.uid()
      or exists (
        select 1 from public.bookings b
        where b.id = booking_id and b.user_id = auth.uid()
      )
    );
end $$;

-- ── RLS: anon read on sites (public booking form) ────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'sites' and policyname = 'sites: anon read'
  ) then
    create policy "sites: anon read" on public.sites for select to anon using (true);
  end if;
end $$;

-- ── RLS: anon insert on bookings (public booking form) ───────────────────────
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'bookings' and policyname = 'bookings: anon insert'
  ) then
    create policy "bookings: anon insert" on public.bookings for insert to anon with check (true);
  end if;
end $$;
