-- One-row table for Vercel cron /api/health pings (keeps Supabase Postgres active).
-- Run the ENTIRE file in Supabase SQL Editor in one go (not a single ALTER line).
-- If you only ran ALTER ... duration_ms and got "relation health_ping_log does not exist",
-- run from "-- One row per successful ping" through the policy at the end of this file.

CREATE TABLE IF NOT EXISTS public.app_health (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ping_count bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.app_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_health_select_anon" ON public.app_health;

-- Allow the browser (anon key) to read status for the admin dashboard.
CREATE POLICY "app_health_select_anon"
  ON public.app_health
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Inserts/updates are done only by the service role (Vercel API route), which bypasses RLS.

INSERT INTO public.app_health (id, last_ping_at, updated_at, ping_count)
VALUES (1, now(), now(), 0)
ON CONFLICT (id) DO NOTHING;

-- One row per successful ping (for admin calendar). Service role inserts; anon can read.
CREATE TABLE IF NOT EXISTS public.health_ping_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pinged_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS health_ping_log_ping_at_idx ON public.health_ping_log (pinged_at DESC);

-- If the table already existed with only (id, pinged_at), add duration:
ALTER TABLE public.health_ping_log ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE public.health_ping_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_ping_log_select_anon" ON public.health_ping_log;

CREATE POLICY "health_ping_log_select_anon"
  ON public.health_ping_log
  FOR SELECT
  TO anon, authenticated
  USING (true);
