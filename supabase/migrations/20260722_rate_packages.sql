-- Package pricing (2026-07-22)
-- Lets a site (e.g. a minibus) be priced with fixed packages — Day / Evening /
-- Weekend etc — instead of an hourly rate. Each package has a label, price,
-- optional deposit override, a fixed time window, and a number of consecutive
-- days it covers (weekend = 2). Bookings store the chosen package and, for
-- multi-day packages, an end_date so calendars can block every covered day.

alter table public.sites
  add column if not exists pricing_mode text not null default 'hourly'
    check (pricing_mode in ('hourly', 'packages')),
  add column if not exists rate_packages jsonb;

alter table public.bookings
  add column if not exists package_label text,
  add column if not exists end_date date;

-- ── Public pricing trigger: validate package bookings server-side ───────────

create or replace function public.enforce_public_booking_pricing()
returns trigger
language plpgsql
security definer
as $$
declare
  s   record;
  pkg jsonb;
  pkg_days int;
begin
  -- Only recompute for anonymous inserts (the public booking form).
  -- Staff-created bookings (authenticated) and service-role writes keep
  -- their caller-computed values (waived deposits, custom rates).
  if coalesce(auth.role(), '') = 'anon' then
    select rate, deposit, pricing_mode, rate_packages into s
    from public.sites where id = new.site_id;
    if not found then
      raise exception 'Invalid site';
    end if;

    if coalesce(s.pricing_mode, 'hourly') = 'packages' then
      select p into pkg
      from jsonb_array_elements(coalesce(s.rate_packages, '[]'::jsonb)) p
      where p->>'label' = new.package_label;
      if pkg is null then
        raise exception 'Please choose a valid package';
      end if;
      pkg_days := greatest(coalesce((pkg->>'days')::int, 1), 1);
      new.type       := 'oneoff';
      new.recurrence := null;
      new.start_time := (pkg->>'start_time')::time;
      new.end_time   := (pkg->>'end_time')::time;
      new.end_date   := case when pkg_days > 1 then new.date + (pkg_days - 1) else null end;
      new.hours      := (extract(epoch from (new.end_time - new.start_time)) / 3600.0) * pkg_days;
      new.deposit    := coalesce((pkg->>'deposit')::numeric, s.deposit);
      new.total      := (pkg->>'price')::numeric + new.deposit;
    else
      new.package_label := null;
      new.end_date      := null;
      new.hours := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
      if new.hours is null or new.hours <= 0 then
        raise exception 'End time must be after start time';
      end if;
      new.deposit := s.deposit;
      new.total   := round(new.hours * s.rate) + s.deposit;
    end if;
  end if;
  return new;
end;
$$;

-- (trigger itself already exists from the security fixes migration; recreate
-- defensively in case that migration hasn't run yet)
drop trigger if exists enforce_public_booking_pricing on public.bookings;
create trigger enforce_public_booking_pricing
  before insert on public.bookings
  for each row execute function public.enforce_public_booking_pricing();

-- ── get_site_bookings: include end_date and package label ───────────────────
-- Return type changes, so drop and recreate

drop function if exists public.get_site_bookings(uuid);
create function public.get_site_bookings(p_site_id uuid)
returns table(
  date text, end_date text, start_time text, end_time text,
  type text, recurrence text,
  cancelled_sessions text[], recurrence_days integer[]
)
language sql security definer stable as $$
  select date::text, end_date::text, start_time, end_time, type, recurrence, cancelled_sessions, recurrence_days
  from public.bookings
  where site_id = p_site_id
    and status in ('confirmed', 'approved')
$$;
grant execute on function public.get_site_bookings to anon, authenticated;
