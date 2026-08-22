# Multi-tenancy: the audit, and where the spec met the code

Phase 0–1 of the `feat/multi-tenant` work. This is the map that the rest of
the branch is built on, and the record of where the spec was adjusted to fit
what already exists.

## Phase 0 — Square

**No Square code exists.** The Square integration was specified in an earlier
project and deliberately deferred before any of it was built. A full-tree grep
for `square` finds only the lucide `Square` icon (a rectangle glyph used by the
dashboard layout editor) and the English word in comments. There are no API
routes, no OAuth handlers, no webhooks, no env references, no migrations to
drop. Nothing to remove.

## The map

**Routes.** The spec names `/request`, `/tech`, `/manager`. The real surfaces:

| Spec name  | Actual route | Guard |
| ---------- | ------------ | ----- |
| /request   | `/kiosk` (customer check-in + walk-in booking, bilingual EN/VI) | `requireKiosk()` + kiosk RLS |
| /tech      | `/tech` | `requireSession()` |
| /manager   | `/dashboard` + Business routes (`/payments`, `/earnings`, `/staff`, `/settings`, …) | `requireManager()` / `requireFloorAccess()` |

**Auth flow.** Supabase Auth (email/password). `getSessionContext()` in
`src/lib/auth.ts` resolves user → profile → salon once per render pass and is
the single place every server component and action gets its role from.
Middleware refreshes tokens and contains the kiosk role; route-group layouts
re-check on the render path.

**salon_id.** 17 of 19 public tables carry a `NOT NULL salon_id` FK. The two
that don't: `salons` (it *is* the tenant) and `kiosk_lookups` (scoped through
its `kiosk_devices` FK). Nothing ignores salon_id — every query path resolves
it through `current_salon_id()`.

**RLS.** Enabled on all 19 tables, before this branch. Every SELECT / UPDATE /
DELETE policy and every INSERT `WITH CHECK` is scoped by
`salon_id = current_salon_id()` (or tighter: own-row scoping for techs,
`user_id = auth.uid()` for notifications) — verified by dumping every policy
predicate from `pg_policies`. Kiosk devices are additionally denied everything
by RESTRICTIVE policies on all sensitive tables. Isolation was already
database-enforced; what this branch adds is the *proof* (the cross-tenant test
suite) plus the tenant-resolution, provisioning and branding layers.

**Salon creation today.** Two paths:

1. `bootstrap_salon(name, full_name)` — SECURITY DEFINER, granted to every
   authenticated user without a salon. Reached from the login page's
   "New salon" tab → signup → `/welcome`. **This is the self-serve path
   Phase 3 removes.**
2. `create_salon_as_owner(name)` — already gated on `is_super_admin()`.

## Where the spec was wrong, and what was done instead

1. **"Enable RLS on every tenant table" was already done.** The schema was
   born with RLS. The phase-2 deliverable is therefore the isolation *test
   suite* (which the spec itself calls the deliverable that matters), not the
   policies.

2. **The role model maps onto five roles, not three.** The spec's
   `platform_admin / owner / tech` exists here as `super_admin / manager /
   tech` — plus two roles the spec doesn't know about that must survive:
   `admin` (front desk: floor control without money/settings) and `kiosk`
   (the check-in tablet's own locked-down account, load-bearing for RLS).
   Postgres cannot drop enum values, and every policy above names the
   existing ones. So: the *stored* values stay canonical, and the spec's
   names are presentation (`super_admin` renders as "Platform admin",
   `manager` as "Owner"). No data migration, no policy rewrite, no enum
   surgery — and the two extra roles keep working.

3. **The subdomain must not become the security boundary.** The spec says
   middleware "puts [the salon] in request context for every downstream
   query". Taken literally that would make a client-controlled header part of
   query scoping. Here, isolation comes from `auth.uid()` →
   `current_salon_id()` under RLS, always. The resolved subdomain is used for:
   the login screen's branding, the salon-not-found page, and redirecting a
   signed-in user whose salon doesn't match the host. It never widens a query.
   A forged Host header gets you a login page wearing someone's logo —
   which is exactly what the public internet gets anyway — and nothing else.

4. **`profiles.salon_id` is NOT NULL, and stays that way.** A platform_admin
   with no salon would need that constraint dropped. Instead the seed script
   parks the platform admin's profile in a "Zolvora HQ" salon row (created by
   the seed, suspended-from-birth so it can never be mistaken for a tenant).
   The admin console runs on `is_super_admin()` + SECURITY DEFINER RPCs, and
   impersonation swaps `current_salon_id()`'s answer — see below.

5. **Impersonation lives in the database, not in a cookie.** Because every
   policy already routes through `current_salon_id()`, impersonation is one
   `impersonations` table plus one branch in that function, and every policy
   in the system follows automatically — reads, writes, RPCs, everything,
   with zero application-layer special-casing. The audit trail is a real
   table (`platform_audit_log`), not a log line.

6. **Suspension is enforced at sign-in and render, retained at rest.** A
   suspended salon's rows are untouched; its users see a status screen; its
   subdomain's login says so plainly. RLS does not change — the data is
   theirs, they just can't work the floor until reactivated.
