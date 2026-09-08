-- Did the scheduled work actually happen?
--
-- A job that stops running looks exactly like a job with nothing to do, which
-- is how a webhook endpoint pointed at a hostname that did not resolve went
-- unnoticed from April to September. Every run gets a row, so silence can be
-- told apart from success.
create table if not exists public.job_runs (
    id       uuid primary key default gen_random_uuid(),
    job      text not null,
    ran_at   timestamptz not null default now(),
    ok       boolean not null default true,
    checked  integer not null default 0,
    detail   jsonb not null default '{}'::jsonb
);

create index if not exists job_runs_job_ran_at_idx on public.job_runs (job, ran_at desc);

-- Written by the service role from edge functions. No policy is granted to
-- authenticated users, and an empty policy list denies rather than allows.
alter table public.job_runs enable row level security;

-- ── pg_cron: daily payment reconciliation ────────────────────────────────────
-- Scheduled on the live project at 07:30 UTC. Recorded here rather than only
-- in cron.job so the schedule is visible to anyone reading the repo.
--
-- select cron.schedule(
--   'reconcile-payments',
--   '30 7 * * *',
--   $$
--   select net.http_post(
--     url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/reconcile-payments',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
