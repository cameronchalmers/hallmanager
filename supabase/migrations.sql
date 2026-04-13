-- ============================================================
-- HallManager — Migrations
-- Run these against an existing database to bring it up to date.
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS / DO blocks).
-- ============================================================

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
