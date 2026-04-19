CREATE TABLE IF NOT EXISTS site_credentials (
  site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  stripe_secret_key text,
  stripe_publishable_key text,
  qf_account_num text,
  qf_app_id text,
  qf_api_key text,
  google_calendar_id text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_credentials ADD COLUMN IF NOT EXISTS google_calendar_id text;
