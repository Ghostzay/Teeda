# Teeda — Nail Salon Management

A lean V1 management platform for nail salons. The product's centre of gravity
is **fair turn rotation**: every technician gets clients in a predictable,
auditable order, and everyone in the shop can see why.

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 + shadcn/ui · Supabase
(Auth, Postgres, Realtime, Storage) · Vercel-ready.

## Modules

| Module | Where |
| --- | --- |
| Auth & roles (manager / tech) | `/login`, `src/lib/auth.ts`, `src/middleware.ts` |
| Tech management + **turn system** | `src/lib/turn.ts`, `supabase/migrations`, `/dashboard`, `/tech` |
| Customer profiles | `/customers` |
| Job / service tracking (walk-in + appointment) | `/jobs` |
| Simple appointments | `/appointments` |
| Manager dashboard | `/dashboard` |

## Turn logic

The rule, in priority order:

1. A tech mid-service is not eligible for the next client.
2. Among free techs, the oldest `last_turn_at` goes next. `NULL` (never taken a
   turn) sorts first, so new hires get worked in.
3. Ties break on hire date — stable and explicable to the floor.

The ordering lives in SQL (`public.turn_queue`) so the app, the appointment
check-in path, and any future integration rotate identically.
`profiles.last_turn_at` is advanced by a **database trigger** the instant a job
flips to `in_progress`, so the clock can't drift even if a row is changed
outside the app.

A manager can override the suggestion at any point — the rotation supplies the
default, never a lock-in.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys
```

Apply the schema — either paste `supabase/migrations/20260728000000_init.sql`
into the Supabase SQL editor, or:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Then:

```bash
npm run dev          # http://localhost:3000
npm run types:gen    # regenerate src/lib/types/database.ts after a migration
```

Create your salon from the **New salon** tab on `/login` — that makes you the
manager. Add technicians from `/settings`.

### Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Creating tech logins from `/settings`; pre-confirming owners |
| `AUTH_AUTO_CONFIRM` | server only | `true` (default) skips email verification on signup |
| `SUPABASE_PROJECT_ID` | local only | `npm run types:gen` |

#### Email verification

While drafting, `AUTH_AUTO_CONFIRM` (on by default whenever
`SUPABASE_SERVICE_ROLE_KEY` is set) creates salon owners already confirmed via
the auth admin API and signs them straight in — no link to click. Technician
logins created from `/settings` are confirmed the same way.

**Before going live**, set `AUTH_AUTO_CONFIRM=false` so real owners verify their
email. Signup then falls back to the standard flow and honours whatever
*Confirm email* is set to in Supabase → Authentication → Sign In / Providers →
Email.

The service role key bypasses RLS. It is only read inside
`src/lib/supabase/admin.ts`, from server actions that have already verified the
caller is a manager.

## Security model

RLS is on for every table, and the app never filters by salon defensively —
the database is the boundary.

- **Managers** read and write everything inside their own salon.
- **Techs** see their own jobs plus the waiting queue, the salon roster (the
  turn board is shared), and customer records. They can start and complete
  their own jobs, or claim an unassigned one.

Policies read the caller's salon and role through `SECURITY DEFINER` helpers
(`current_salon_id()`, `is_manager()`) so the policy on `profiles` can't recurse
into itself.

## Realtime

`src/components/realtime-refresher.tsx` is the only always-on client component.
It subscribes to Postgres changes for the salon and calls `router.refresh()`,
so Server Components re-render with fresh data on every device in the shop.
RLS applies to the replication stream too — a tech only receives events for
rows their policies allow.

## Architecture notes

- Server Components render every screen; Server Actions perform every mutation.
- Client components are limited to: realtime, toasts, form submit state, the
  new-client toggle, and the photo upload.
- Every action returns the same `ActionState` shape, consumed by
  `ActionForm` / `ActionButton`.
- All turn mutations go through RPCs (`start_job`, `complete_job`, `assign_job`)
  that re-check authorization server-side, independent of the UI.

## Deploying to Vercel

Import the repo, set the four environment variables above, and deploy. No other
configuration is needed — every route is server-rendered on demand.

## Structure

```
src/
├── app/
│   ├── (app)/                 authenticated shell (header + tab bar + realtime)
│   │   ├── dashboard/         manager floor view
│   │   ├── tech/              tech view: current job + turn position
│   │   ├── jobs/              create + list
│   │   ├── appointments/      day view + booking
│   │   ├── customers/         profiles
│   │   └── settings/          salon + team
│   ├── login/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                    shadcn/ui primitives
│   ├── turn-board.tsx         the rotation board
│   ├── job-card.tsx           one client on the floor
│   └── realtime-refresher.tsx
├── lib/
│   ├── actions/               server actions (auth, jobs, customers, …)
│   ├── supabase/              server / browser / admin / middleware clients
│   ├── types/                 generated DB types + domain types
│   ├── turn.ts                turn management
│   ├── queries.ts             shared reads
│   └── auth.ts                session context + guards
└── middleware.ts              session refresh + route gating
```
