# Teeda — Nail Salon Management

A lean V1 management platform for nail salons. The product's centre of gravity
is **fair turn rotation**: every technician gets clients in a predictable,
auditable order, and everyone in the shop can see why.

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 + shadcn/ui · Supabase
(Auth, Postgres, Realtime, Storage) · Vercel-ready.

## Modules

| Module | Where |
| --- | --- |
| Auth & roles (manager / admin / tech) | `/login`, `src/lib/auth.ts`, `src/middleware.ts` |
| Tech management + **turn system** | `src/lib/turn.ts`, `supabase/migrations`, `/dashboard`, `/tech` |
| Customer profiles | `/customers` |
| Job / service tracking (walk-in + appointment) | `/jobs` |
| Simple appointments | `/appointments` |
| Manager dashboard | `/dashboard` |
| Payment tracking | `src/lib/actions/payments.ts`, `src/components/payment-dialog.tsx` |

## Roles

| Role | Can do |
| --- | --- |
| **Manager** | Everything: salon settings, the team roster, takings. |
| **Admin** | Runs the floor — check-ins, jobs, the queue, payments. No settings, no roster, no team changes. |
| **Tech** | Their own turn, their own clients and appointments. Cannot create clients or jobs. |

Two capability lines in code: `canManageFloor` (manager + admin) and
`isManager` (manager only). In SQL they are `can_manage_floor()` and
`is_manager()`, and every policy uses one or the other.

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

A manager or admin can override the suggestion at any point — the rotation
supplies the default, never a lock-in.

**Accept / Pass.** A tech offered a client can accept it (starts the service,
consumes the turn) or pass. Passing costs them their place: `last_turn_at`
moves to now and the client is offered to whoever is next. Without that price,
techs could skip work they didn't want and still hold the front of the queue.

## Payments

Recorded, not processed — nothing here moves money, and there is no Stripe
integration. `record_payment()` stores the service amount, tip, method
(cash/card/other), which tech the tip belongs to, and an optional note, then
completes the job in the same call, because the desk does both in one motion
at the counter. One payment row per job; re-recording corrects it.

Managers and admins see today's till on the dashboard. A tech sees exactly one
money figure: their own tips today (`my_tips_today()`), and payment rows only
where the tip is theirs.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys
```

Apply the schema — run **every** file in `supabase/migrations/`, in filename
order, either by pasting them into the Supabase SQL editor one at a time or
with:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Signing up creates your salon and drops you straight into the dashboard. If a
signed-in account has no salon yet, `/welcome` picks it up and creates one —
no account can get stranded.

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
- **Admins** get the same floor access — jobs, customers, appointments,
  payments — but no writes to `salons` or `profiles`, so settings and the
  roster stay closed to them.
- **Techs** see their own jobs plus the waiting queue, the salon roster (the
  turn board is shared), and customer records. They can accept, pass, and
  finish their own jobs. They cannot create clients or jobs, and the only
  payment rows they can read are ones where the tip is theirs.

Policies read the caller's salon and role through `SECURITY DEFINER` helpers
(`current_salon_id()`, `is_manager()`, `can_manage_floor()`) so the policy on
`profiles` can't recurse into itself.

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
- All turn and money mutations go through RPCs (`start_job`, `skip_job`,
  `complete_job`, `assign_job`, `record_payment`) that re-check authorization
  server-side, independent of the UI.

## Troubleshooting

**"The database isn't set up yet"** on `/welcome` — the migrations haven't been
applied to this project. Run every file in `supabase/migrations/`, in order.

**Signup works but you land on `/welcome` every time** — the salon insert is
failing. Check the Supabase logs; the most common cause is a migration that
was skipped.

**`unsafe use of new value "admin" of enum type`** — `20260728020000` and
`20260728030000` were run in the same transaction. Postgres won't let a new
enum label be used in the transaction that adds it; run the two files
separately.

**`permission denied for table …`** — the `authenticated` role is missing table
grants (happens if the `public` schema was recreated). The second migration
grants them explicitly; re-run it.

Creating a trigger on `auth.users` needs elevated privileges and can fail
depending on how you run the SQL. That's survivable by design: both migrations
wrap it in an exception handler, and the app creates salons through
`public.bootstrap_salon()` regardless.

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
