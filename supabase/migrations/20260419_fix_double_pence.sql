-- Compensating fix: integer_pence migration was applied twice to bookings,
-- extra_slots, and invoices — divide all affected amounts back by 100.
-- Sites table is correct and is NOT touched.

UPDATE bookings SET
  deposit = ROUND(deposit / 100),
  total   = ROUND(total   / 100);

UPDATE extra_slots SET
  rate  = ROUND(rate  / 100),
  total = ROUND(total / 100);

UPDATE invoices SET
  amount = ROUND(amount / 100);

-- Clear Stripe payment links on approved bookings — they were generated
-- with the inflated amounts and are no longer valid.
UPDATE bookings SET
  stripe_payment_url    = NULL,
  stripe_payment_status = NULL,
  stripe_session_id     = NULL
WHERE status = 'approved'
  AND stripe_payment_url IS NOT NULL;
