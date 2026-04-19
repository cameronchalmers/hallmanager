ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
