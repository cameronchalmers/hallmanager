-- District pricing (2026-07-22)
-- Package sites can offer a discounted "district" price per package (e.g. for
-- Scout groups within the district). The booker self-declares on the form via
-- a checkbox; because every booking is manually approved, staff verify the
-- claim before the discounted payment link goes out. bookings.is_district
-- records the claim/decision; sites.district_label sets the form wording.
-- Each package carries an optional district_price (a total for fixed packages,
-- or a daily rate for per_day packages); length-discount tiers apply to
-- whichever rate is active.

alter table public.bookings
  add column if not exists is_district boolean not null default false;

alter table public.sites
  add column if not exists district_label text;

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

      if coalesce(s.site_type, 'hall') = 'vehicle' then
        new.hours := ((pkg_days - 1) * 24) + (extract(epoch from (new.end_time - new.start_time)) / 3600.0);
      else
        new.hours := (extract(epoch from (new.end_time - new.start_time)) / 3600.0) * pkg_days;
      end if;

      new.deposit := 0;
    else
      new.package_label := null;
      new.end_date      := null;
      new.is_district   := false;
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
