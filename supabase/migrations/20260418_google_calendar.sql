ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text;
