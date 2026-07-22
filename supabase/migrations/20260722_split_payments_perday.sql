-- Split payments + per-day pricing (2026-07-22)
-- Package-priced sites (vehicles) move to a two-stage payment: 25% of the
-- total confirms the booking (stripe_payment_status 'deposit_paid'), the 75%
-- balance is due 14 days before the booking. The separate refundable damage
-- deposit is dropped for package sites (deposit = 0; total = hire price).
-- Packages can now be 'fixed' (as before) or 'per_day': customer picks an
-- end date, price = days x daily rate with whole-booking discount tiers
-- (e.g. 10% off at 4+ days, 15% at 6+).

alter table public.bookings
  add column if not exists amount_paid numeric(10,2) not null default 0;

create or replace function public.enforce_public_booking_pricing()
returns trigger
language plpgsql
security definer
as $$
declare
  s        record;
  pkg      jsonb;
  pkg_days int;
  tier     jsonb;
  pct      numeric := 0;
  min_d    int;
  max_d    int;
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
      new.start_time := (pkg->>'start_time')::time;
      new.end_time   := (pkg->>'end_time')::time;

      if coalesce(pkg->>'pricing', 'fixed') = 'per_day' then
        -- Customer-chosen end date; price scales with length
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
        -- Whole-booking discount: highest tier whose min_days is met
        for tier in select * from jsonb_array_elements(coalesce(pkg->'tiers', '[]'::jsonb))
        loop
          if pkg_days >= coalesce((tier->>'min_days')::int, 999999)
             and coalesce((tier->>'discount_pct')::numeric, 0) > pct then
            pct := (tier->>'discount_pct')::numeric;
          end if;
        end loop;
        if pkg_days = 1 then new.end_date := null; end if;
        new.total := round(pkg_days * (pkg->>'price')::numeric * (100 - pct) / 100);
      else
        pkg_days := greatest(coalesce((pkg->>'days')::int, 1), 1);
        new.end_date := case when pkg_days > 1 then new.date + (pkg_days - 1) else null end;
        new.total := (pkg->>'price')::numeric;
      end if;

      if coalesce(s.site_type, 'hall') = 'vehicle' then
        new.hours := ((pkg_days - 1) * 24) + (extract(epoch from (new.end_time - new.start_time)) / 3600.0);
      else
        new.hours := (extract(epoch from (new.end_time - new.start_time)) / 3600.0) * pkg_days;
      end if;

      -- Package sites: no separate damage deposit — 25% of total confirms
      new.deposit := 0;
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
