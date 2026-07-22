-- Security fixes (2026-07-22)
-- 1) site_admin was missing from the staff role helper, so site_admins were
--    blocked by RLS from reading/updating bookings, sites, invoices, etc.
-- 2) Public (anon) booking submissions trusted client-computed deposit/total —
--    recompute them server-side from the site's rate instead.
-- 3) Secret credentials (Stripe secret key, webhook secret, QuickFile API key)
--    were readable by any manager from the browser — make them write-only.

-- ── 1) Include site_admin in the staff role helper ──────────────────────────

create or replace function public.is_admin_or_manager()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
    and role in ('admin', 'site_admin', 'manager')
  );
$$;

-- ── 2) Server-side pricing for public booking submissions ───────────────────

create or replace function public.enforce_public_booking_pricing()
returns trigger
language plpgsql
security definer
as $$
declare
  site_rate    numeric;
  site_deposit numeric;
begin
  -- Only recompute for anonymous inserts (the public booking form).
  -- Staff-created bookings (authenticated) and service-role writes keep
  -- their caller-computed values (waived deposits, custom rates).
  if coalesce(auth.role(), '') = 'anon' then
    select rate, deposit into site_rate, site_deposit
    from public.sites where id = new.site_id;
    if site_rate is null then
      raise exception 'Invalid site';
    end if;
    new.hours := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
    if new.hours is null or new.hours <= 0 then
      raise exception 'End time must be after start time';
    end if;
    new.deposit := site_deposit;
    new.total := round(new.hours * site_rate) + site_deposit;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_public_booking_pricing on public.bookings;
create trigger enforce_public_booking_pricing
  before insert on public.bookings
  for each row execute function public.enforce_public_booking_pricing();

-- ── 3) Make secret credentials write-only from the client ───────────────────
-- Edge functions use the service role and keep full access. The client can
-- still insert/update secrets, but can only read back the non-secret columns.

revoke select on public.site_credentials from authenticated, anon;
grant select (site_id, stripe_publishable_key, qf_account_num, qf_app_id, google_calendar_id, updated_at)
  on public.site_credentials to authenticated;

-- Set/unset flags so the settings UI can show "saved" without reading values
create or replace function public.get_site_credentials_status(p_site_id uuid)
returns json
language sql
security definer
stable
as $$
  select json_build_object(
    'stripe_secret_key',     coalesce(stripe_secret_key, '') <> '',
    'stripe_webhook_secret', coalesce(stripe_webhook_secret, '') <> '',
    'qf_api_key',            coalesce(qf_api_key, '') <> ''
  )
  from public.site_credentials
  where site_id = p_site_id
    and (
      exists (select 1 from public.users where id = auth.uid() and role = 'admin')
      or exists (
        select 1 from public.users
        where id = auth.uid()
          and role in ('site_admin', 'manager')
          and p_site_id::text = any(site_ids)
      )
    );
$$;

revoke execute on function public.get_site_credentials_status(uuid) from anon;
