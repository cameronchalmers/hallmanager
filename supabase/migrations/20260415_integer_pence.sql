-- Migrate all monetary columns from decimal pounds to integer pence.
-- Run this against your Supabase database ONCE before deploying the matching
-- frontend/edge-function code changes.

BEGIN;

-- Sites: rate (£/hr) and deposit (£) → pence
ALTER TABLE sites
  ALTER COLUMN rate    TYPE integer USING ROUND(rate    * 100)::integer,
  ALTER COLUMN deposit TYPE integer USING ROUND(deposit * 100)::integer;

-- Bookings: deposit and total → pence
ALTER TABLE bookings
  ALTER COLUMN deposit TYPE integer USING ROUND(deposit * 100)::integer,
  ALTER COLUMN total   TYPE integer USING ROUND(total   * 100)::integer;

-- Extra slots: rate (£/hr) and total → pence
ALTER TABLE extra_slots
  ALTER COLUMN rate  TYPE integer USING ROUND(rate  * 100)::integer,
  ALTER COLUMN total TYPE integer USING ROUND(total * 100)::integer;

-- Invoices: amount → pence
ALTER TABLE invoices
  ALTER COLUMN amount TYPE integer USING ROUND(amount * 100)::integer;

-- Users: custom_rates JSONB values (per-site £/hr rates) → pence
UPDATE users
SET custom_rates = (
  SELECT jsonb_object_agg(key, (ROUND((value::text)::numeric * 100))::integer)
  FROM jsonb_each(custom_rates)
)
WHERE custom_rates IS NOT NULL
  AND custom_rates != 'null'::jsonb
  AND custom_rates != '{}'::jsonb;

COMMIT;
