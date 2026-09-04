-- ============================================================================
-- StayIn · Purge unverified Supabase Auth accounts older than 7 days
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor (requires postgres role / service-role).
--
-- Usage:
--   1. Manual one-off: paste into the SQL Editor and run.
--   2. Recurring via pg_cron (requires the pg_cron extension):
--      enable the extension, then uncomment the scheduled job below.
-- ============================================================================

-- 1) One-off: delete every auth.users row that was created more than 7 days ago
--    and has never been email-confirmed.  Supabase stores auth data in the
--    `auth` schema; `auth.users` is the canonical user table.
--
--    Safe to re-run: the WHERE clause is idempotent.

DELETE FROM auth.users
WHERE email_confirmed_at IS NULL
  AND created_at < now() - interval '7 days';

-- 2) Recurring cleanup via pg_cron (once per day at 03:00 UTC).
--    Uncomment AFTER enabling the pg_cron extension in the Supabase dashboard:
--      Database → Extensions → pg_cron  (toggle ON)

-- cron.schedule(
--   'stayin-purge-unverified-users',
--   '0 3 * * *',          -- every day at 03:00 UTC
--   $$DELETE FROM auth.users
--     WHERE email_confirmed_at IS NULL
--       AND created_at < now() - interval '7 days';$$
-- );
