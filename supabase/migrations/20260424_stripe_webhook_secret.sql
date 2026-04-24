ALTER TABLE public.site_credentials
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret text;
