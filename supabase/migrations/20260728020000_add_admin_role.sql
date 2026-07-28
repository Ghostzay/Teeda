-- ============================================================================
-- Adds the `admin` role.
--
-- This file does nothing but extend the enum, on purpose: Postgres will not
-- let a newly added enum label be *used* in the same transaction that adds it.
-- Keeping it alone means the next migration can reference 'admin' freely.
-- ============================================================================

alter type public.user_role add value if not exists 'admin';
