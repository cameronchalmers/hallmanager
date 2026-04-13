-- ============================================================
-- HallManager — Supabase Schema + RLS
-- Paste this into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Enable UUID extension (usually already on)
create extension if not exists "uuid-ossp";


-- ============================================================
-- TABLES
-- ============================================================

-- Sites / Venues
create table if not exists public.sites (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  address          text not null default '',
  capacity         int  not null default 0,
  rate             numeric(10,2) not null default 0,
  deposit          numeric(10,2) not null default 0,
  emoji            text not null default '🏛️',
  min_hours        numeric(5,2),
  available_from   time,
  available_until  time,
  availability     jsonb,
  description      text,
  amenities        text[],
  photos           text[]
);

-- App users (mirrors auth.users, extended with role + prefs)
create table if not exists public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null default '',
  email        text not null default '',
  role         text not null default 'regular' check (role in ('admin','manager','regular')),
  site_ids     uuid[] not null default '{}',
  avatar       text,
  color        text,
  qf_client_id text,
  custom_rates jsonb,
  group_name   text,
  created_at   timestamptz not null default now()
);

-- Bookings
create table if not exists public.bookings (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null,
  email                text not null default '',
  phone                text not null default '',
  type                 text not null default '',
  event                text not null default '',
  date                 date not null,
  start_time           time not null,
  end_time             time not null,
  hours                numeric(5,2) not null default 0,
  site_id              uuid not null references public.sites(id) on delete restrict,
  status               text not null default 'pending'
                         check (status in ('pending','approved','confirmed','denied','cancelled')),
  notes                text,
  deposit              numeric(10,2) not null default 0,
  total                numeric(10,2) not null default 0,
  user_id              uuid references public.users(id) on delete set null,
  recurrence           text,
  stripe_session_id    text,
  stripe_payment_url   text,
  stripe_payment_status text,
  attended             boolean,
  session_attendance   jsonb,
  cancelled_sessions   text[] default '{}',
  approved_at          timestamptz,
  created_at           timestamptz not null default now()
);

-- Invoices
create table if not exists public.invoices (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid references public.bookings(id) on delete set null,
  user_id     uuid references public.users(id) on delete set null,
  description text not null default '',
  amount      numeric(10,2) not null default 0,
  status      text not null default 'draft' check (status in ('draft','sent','paid','overdue')),
  date        date not null default current_date,
  qf_ref      text,
  qf_synced   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Extra slot requests (one-off sessions from regular bookers)
create table if not exists public.extra_slots (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null default '',
  site_id     uuid not null references public.sites(id) on delete restrict,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  hours       numeric(5,2) not null default 0,
  reason      text not null default '',
  status      text not null default 'pending'
                check (status in ('pending','approved','denied','cancelled')),
  rate        numeric(10,2) not null default 0,
  total       numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);


-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists bookings_date_idx       on public.bookings(date);
create index if not exists bookings_status_idx     on public.bookings(status);
create index if not exists bookings_user_id_idx    on public.bookings(user_id);
create index if not exists bookings_site_id_idx    on public.bookings(site_id);
create index if not exists invoices_user_id_idx    on public.invoices(user_id);
create index if not exists extra_slots_user_id_idx on public.extra_slots(user_id);
create index if not exists extra_slots_status_idx  on public.extra_slots(status);


-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.sites        enable row level security;
alter table public.users        enable row level security;
alter table public.bookings     enable row level security;
alter table public.invoices     enable row level security;
alter table public.extra_slots  enable row level security;


-- ============================================================
-- HELPER: is the current user an admin or manager?
-- ============================================================

create or replace function public.is_admin_or_manager()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
    and role in ('admin', 'manager')
  );
$$;


-- ============================================================
-- RLS POLICIES — SITES
-- Everyone authenticated can read sites.
-- Only admins/managers can insert/update.
-- ============================================================

create policy "sites: authenticated read"
  on public.sites for select
  to authenticated
  using (true);

create policy "sites: admin/manager insert"
  on public.sites for insert
  to authenticated
  with check (public.is_admin_or_manager());

create policy "sites: admin/manager update"
  on public.sites for update
  to authenticated
  using (public.is_admin_or_manager())
  with check (public.is_admin_or_manager());

create policy "sites: admin/manager delete"
  on public.sites for delete
  to authenticated
  using (public.is_admin_or_manager());

-- Public booking form needs to read sites (anon)
create policy "sites: anon read"
  on public.sites for select
  to anon
  using (true);


-- ============================================================
-- RLS POLICIES — USERS
-- Users can read their own row.
-- Admins/managers can read all users.
-- Only admins/managers can update other users.
-- ============================================================

create policy "users: read own row"
  on public.users for select
  to authenticated
  using (id = auth.uid() or public.is_admin_or_manager());

-- Regular users can update their own non-sensitive fields; admins/managers can update anyone.
-- Role changes are blocked at the row level for non-admins — route through the edge function instead.
create policy "users: update own row"
  on public.users for update
  to authenticated
  using (id = auth.uid() or public.is_admin_or_manager())
  with check (
    -- Admins/managers can update any field on any row
    public.is_admin_or_manager()
    -- Regular users can only update their own row, and cannot change their role
    or (id = auth.uid() and role = (select role from public.users where id = auth.uid()))
  );

create policy "users: admin insert"
  on public.users for insert
  to authenticated
  with check (public.is_admin_or_manager());


-- ============================================================
-- RLS POLICIES — BOOKINGS
-- Regular bookers can read their own bookings.
-- Admins/managers can read and write all bookings.
-- Anon can insert (public booking form).
-- ============================================================

create policy "bookings: read own or admin"
  on public.bookings for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin_or_manager());

create policy "bookings: insert own or admin"
  on public.bookings for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_admin_or_manager());

-- Public booking form submits as anon — restrict to safe defaults only
create policy "bookings: anon insert"
  on public.bookings for insert
  to anon
  with check (
    status = 'pending'
    and stripe_payment_status is null
    and stripe_session_id is null
    and user_id is null
  );

create policy "bookings: update admin/manager only"
  on public.bookings for update
  to authenticated
  using (public.is_admin_or_manager())
  with check (public.is_admin_or_manager());

create policy "bookings: delete admin only"
  on public.bookings for delete
  to authenticated
  using (public.is_admin_or_manager());


-- ============================================================
-- RLS POLICIES — INVOICES
-- Users can see their own invoices.
-- Admins/managers can see and manage all invoices.
-- ============================================================

create policy "invoices: read own or admin"
  on public.invoices for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin_or_manager());

create policy "invoices: insert admin/manager"
  on public.invoices for insert
  to authenticated
  with check (public.is_admin_or_manager());

create policy "invoices: update admin/manager"
  on public.invoices for update
  to authenticated
  using (public.is_admin_or_manager())
  with check (public.is_admin_or_manager());


-- ============================================================
-- RLS POLICIES — EXTRA SLOTS
-- Regular bookers can read and insert their own requests.
-- Admins/managers can read and update all (approve/deny/cancel).
-- ============================================================

create policy "extra_slots: read own or admin"
  on public.extra_slots for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin_or_manager());

create policy "extra_slots: insert own"
  on public.extra_slots for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "extra_slots: update admin/manager"
  on public.extra_slots for update
  to authenticated
  using (public.is_admin_or_manager())
  with check (public.is_admin_or_manager());


-- ============================================================
-- TRIGGER: auto-create users row on auth sign-up
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'regular'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- TRIGGER: set approved_at when booking status changes to 'approved'
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


-- ============================================================
-- SEED DATA — sample sites (safe to re-run with ON CONFLICT)
-- ============================================================

insert into public.sites (id, name, address, capacity, rate, deposit, emoji) values
  ('11111111-1111-1111-1111-111111111111', 'The Grand Hall',    '1 Main Street, London',      200, 85.00, 150.00, '🏛️'),
  ('22222222-2222-2222-2222-222222222222', 'Studio One',        '12 Arts Quarter, Manchester', 40,  45.00, 75.00,  '🎭'),
  ('33333333-3333-3333-3333-333333333333', 'Community Centre',  '5 Park Road, Birmingham',     120, 35.00, 50.00,  '🏫')
on conflict (id) do nothing;
