-- Vehicle sites (2026-07-22)
-- Adds a hall/vehicle site type. Vehicle sites always use package pricing,
-- have no opening hours, use pickup → return time semantics (pickup at
-- start_time on the first day, return at end_time on the last day), and can
-- define their own booking-form questions (custom_questions on sites,
-- answers stored on bookings.custom_answers).

alter table public.sites
  add column if not exists site_type text not null default 'hall'
    check (site_type in ('hall', 'vehicle')),
  add column if not exists custom_questions jsonb;

alter table public.bookings
  add column if not exists custom_answers jsonb;

-- ── Pricing trigger: vehicle hours are elapsed pickup → return ──────────────

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
  if coalesce(auth.role(), '') = 'anon' then
    select rate, deposit, pricing_mode, rate_packages, site_type into s
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
      if coalesce(s.site_type, 'hall') = 'vehicle' then
        -- Elapsed time from pickup (day 1, start_time) to return (last day, end_time)
        new.hours := ((pkg_days - 1) * 24) + (extract(epoch from (new.end_time - new.start_time)) / 3600.0);
      else
        -- Hall packages: fixed daily window repeated over the covered days
        new.hours := (extract(epoch from (new.end_time - new.start_time)) / 3600.0) * pkg_days;
      end if;
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

drop trigger if exists enforce_public_booking_pricing on public.bookings;
create trigger enforce_public_booking_pricing
  before insert on public.bookings
  for each row execute function public.enforce_public_booking_pricing();
