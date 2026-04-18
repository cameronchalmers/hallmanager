ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS review_sent boolean DEFAULT false;
