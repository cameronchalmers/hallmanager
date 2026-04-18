ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS refunded_amount integer;
