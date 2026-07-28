-- ============================================================================
-- Adds the `super_admin` role — the salon owner, above manager.
--
-- Alone in its own file: Postgres won't let a newly added enum label be used
-- in the transaction that adds it.
-- ============================================================================

alter type public.user_role add value if not exists 'super_admin';
