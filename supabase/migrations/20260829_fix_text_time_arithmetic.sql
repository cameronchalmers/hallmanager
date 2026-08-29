-- Fix: public bookings failed with "operator does not exist: text - text",
-- plus support for bookings that run to/past midnight (2026-08-29)
--
-- bookings.start_time / end_time are TEXT columns holding "HH:MM", not `time`.
-- enforce_public_booking_pricing subtracted them directly
-- (`new.end_time - new.start_time`), which Postgres rejects. The trigger only
-- runs for auth.role() = 'anon', so admin-created bookings were unaffected and
-- the breakage went unnoticed since the 2026-07-22 security-fixes migration —
-- every booking submitted through the public form errored out.
--
-- Fix: cast to `time` for the arithmetic, and normalise package times back to
-- "HH:MM" on the way in (Google Calendar sync and the email templates both
-- assume that format, so "09:00:00" would break them).
--
-- Also: an end time earlier than the start now means the booking runs past
-- midnight (14:00 - 00:00 is a 10-hour evening hire) rather than being
-- rejected. Vehicles keep the signed span — their end time belongs to the
-- return day, not the pickup day, so it can legitimately be earlier.

create or replace function public.enforce_public_booking_pricing()
returns trigger
language plpgsql
security definer
as $$
declare
  s          record;
  pkg        jsonb;
  pkg_days   int;
  tier       jsonb;
  pct        numeric := 0;
  min_d      int;
  max_d      int;
  base_price numeric;
  dist_raw   text;
  span_hours numeric;
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

      new.type       := 'oneoff';
      new.recurrence := null;
      new.start_time := to_char((pkg->>'start_time')::time, 'HH24:MI');
      new.end_time   := to_char((pkg->>'end_time')::time, 'HH24:MI');

      -- District rate replaces the standard rate when claimed and set
      dist_raw := pkg->>'district_price';
      if new.is_district and dist_raw is not null and dist_raw <> '' then
        base_price := dist_raw::numeric;
      else
        base_price := (pkg->>'price')::numeric;
      end if;

      if coalesce(pkg->>'pricing', 'fixed') = 'per_day' then
        if new.end_date is null or new.end_date < new.date then
          raise exception 'Please choose a valid end date';
        end if;
        pkg_days := (new.end_date - new.date) + 1;
        min_d := greatest(coalesce((pkg->>'min_days')::int, 1), 1);
        max_d := coalesce((pkg->>'max_days')::int, 60);
        if pkg_days < min_d then
          raise exception 'Minimum hire for this package is % days', min_d;
        end if;
        if pkg_days > max_d then
          raise exception 'Maximum hire for this package is % days', max_d;
        end if;
        for tier in select * from jsonb_array_elements(coalesce(pkg->'tiers', '[]'::jsonb))
        loop
          if pkg_days >= coalesce((tier->>'min_days')::int, 999999)
             and coalesce((tier->>'discount_pct')::numeric, 0) > pct then
            pct := (tier->>'discount_pct')::numeric;
          end if;
        end loop;
        if pkg_days = 1 then new.end_date := null; end if;
        new.total := round(pkg_days * base_price * (100 - pct) / 100);
      else
        pkg_days := greatest(coalesce((pkg->>'days')::int, 1), 1);
        new.end_date := case when pkg_days > 1 then new.date + (pkg_days - 1) else null end;
        new.total := base_price;
      end if;

      -- Signed span: a vehicle can be returned earlier in the day than it was
      -- picked up (pickup Fri 17:00, return Sun 09:00)
      span_hours := extract(epoch from (new.end_time::time - new.start_time::time)) / 3600.0;
      if coalesce(s.site_type, 'hall') = 'vehicle' then
        new.hours := ((pkg_days - 1) * 24) + span_hours;
      else
        -- A hall package window that ends before it starts runs past midnight
        new.hours := (case when span_hours < 0 then span_hours + 24 else span_hours end) * pkg_days;
      end if;

      new.deposit := 0;
    else
      new.package_label := null;
      new.end_date      := null;
      new.is_district   := false;
      span_hours := extract(epoch from (new.end_time::time - new.start_time::time)) / 3600.0;
      -- Ends before it starts => runs past midnight (e.g. 20:00 - 00:30)
      if span_hours < 0 then span_hours := span_hours + 24; end if;
      new.hours := span_hours;
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
