-- ============================================================================
-- A role for the tablet by the door.
--
-- RUN THIS FILE ON ITS OWN. Postgres will not let a new enum value be used in
-- the same transaction that adds it, and the Supabase SQL editor wraps a whole
-- file in one transaction — so anything referencing 'kiosk' has to wait for the
-- next migration. That is the only reason this is two lines in its own file.
--
-- Adding a value changes no existing row: every current profile keeps the role
-- it has, and the two SQL gatekeepers — `is_manager()` and `can_manage_floor()`
-- — are written as allow-lists, so a new value grants nothing anywhere by
-- simply existing.
-- ============================================================================

alter type public.user_role add value if not exists 'kiosk';
