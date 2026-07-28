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
| Payment tracking + splits | `src/lib/actions/payments.ts`, `src/components/payment-dialog.tsx` |
| Service menu & pricing | `src/components/service-manager.tsx`, `/settings` |
| Skills & daily check-in | `src/lib/actions/rotation.ts`, `src/components/checkin-card.tsx` |
| Earnings dashboards | `src/components/earnings.tsx` |
| In-app notifications | `src/components/notifications-card.tsx` |
| Hourly schedule (day + week) | `src/components/schedule-grid.tsx`, `/schedule` |
| Per-tech commission rates | `src/lib/actions/commission.ts`, `/staff` |

## Roles

| Role | Can do |
| --- | --- |
| **Super Admin** | Everything a manager can do, plus creating salons — the only role that can. |
| **Manager** | Everything: salon settings, the team roster, takings. |
| **Admin** | Runs the floor — check-ins, jobs, the queue, payments. No settings, no roster, no team changes. |
| **Tech** | Their own turn, their own clients and appointments. Cannot create clients or jobs. |

Two capability lines in code: `canManageFloor` (manager + admin) and
`isManager` (manager only). In SQL they are `can_manage_floor()` and
`is_manager()`, and every policy uses one or the other.

## Turn logic

The rule, in priority order:

1. **Checked in today.** Being on the roster isn't enough — a tech opts into
   the rotation each day, so "who's actually here" is recorded, not inferred.
   Managers and admins can check someone in or out from the board.
2. **Has the skill.** A service declares required skills; a tech declares what
   they offer. The rotation never hands someone work they don't do.
3. A tech mid-service is not eligible for the next client.
4. Among the remaining, the oldest `last_turn_at` goes next. `NULL` (never
   taken a turn) sorts first, so new hires get worked in.
5. Ties break on hire date — stable and explicable to the floor.

The ordering lives in SQL (`public.turn_queue`) so the app, the appointment
check-in path, and any future integration rotate identically.
`profiles.last_turn_at` is advanced by a **database trigger** the instant a job
flips to `in_progress`, so the clock can't drift even if a row is changed
outside the app.

A manager or admin can override the suggestion at any point — the rotation
supplies the default, never a lock-in.

**Accept / Pass.** A tech offered a client can accept it (starts the service,
consumes the turn) or pass. Passing costs them their place: `last_turn_at`
moves to now and the client is offered to the next tech *who has the skill*.
Without that price, techs could skip work they didn't want and still hold the
front of the queue.

## Services and skills

`skill` is the shared vocabulary — a single enum, so matching is a plain array
containment test rather than two join tables. Managers own the price list
(`services`); techs own their own skill list, and managers can correct it.

New salons get a starter menu automatically, seeded by a trigger on `salons`
rather than a one-off INSERT — a plain seed only covers salons that exist when
the migration runs, leaving every later salon with an empty menu.

Line items are snapshotted onto the job at checkout, so editing or deleting a
service never rewrites what a past client was charged.

## Schedule

`schedule_blocks` is the single source of truth for a tech's time — booked
work, breaks and unavailability all land in one table. Appointments write
their own block through a trigger, so the schedule can't drift from the
booking.

The 5-minute buffer either side is maintained by the database (`blocked_from`
/ `blocked_to`), not recomputed by each caller, and a GiST exclusion
constraint on `(tech_id, blocked_range)` makes double-booking impossible
rather than merely discouraged.

`turn_queue` exposes `is_booked_now`, so a tech inside an appointment window —
buffer included — drops out of the walk-in rotation for exactly that window
and returns on their own afterwards.

Day view shows every tech side by side for the floor, or just their own column
for a tech. Week view is always one tech at a time: a week times a full roster
is unreadable on a tablet, and the question it answers is "when is this person
free?".

### Shifts vs. bookings

`schedule_blocks` answers "when is this tech unavailable?" — which is why it
forbids overlap. A shift is the opposite: it is the window a tech is
*available*, and appointments are meant to sit inside it. Those two rules
cannot share a table, so shifts live in `shift_blocks` with their own GiST
exclusion constraint (a tech cannot be rostered twice at once, but a booking
inside a shift is expected, not a conflict).

`schedule_overlay(p_from, p_to, p_tech_id)` unions the three layers the grid
draws — `shift`, `appointment`, `walkin` — and returns an `editable` flag per
row (`can_manage_floor() or tech_id = auth.uid()`), so the client never has to
re-derive permission. Only the shift layer is writable, through `save_shift`
and `delete_shift`; appointments and walk-ins are drawn read-only with a
hatched fill and a type label, so the distinction survives for anyone who
can't separate two hues.

`shift_blocks.salon_id` defaults to `current_salon_id()`. There is one salon
per install this iteration, but the column stays so multi-salon remains open.

## One clock

Every "today" in the product is measured against the salon's own timezone
(`salons.timezone`), resolved by `salon_today()` and `salon_day_start()`.

This used to be three different clocks: `current_date` and
`date_trunc('day', now())` in Postgres (UTC on Supabase) and a JS
`startOfToday()` in the app (the Node process's zone). They agree on a server
running UTC and disagree with the salon always.

The visible symptom was a header reading "0 on rotation" beside "5 done today".
`turn_checkins.checkin_date` rolled over at UTC midnight — 7pm Eastern, 4pm
Pacific, the middle of the evening shift — so techs silently dropped off the
rotation and `start_job` began refusing with *"Check in for turns before taking
a client"* on a day they had checked in, while the jobs they had already
finished still counted.

`today_stats()` now returns every dashboard count from one query on that one
clock, including `checked_in`, so the two figures are commensurable by
construction. They can still differ — "on rotation" is this instant, "done
today" is the whole day — which is why the dashboard states them as separate
lines rather than one run-on sentence.

Set it under Settings → The salon day. A zone Postgres cannot resolve is
rejected by a trigger rather than silently becoming UTC.

## Payments

Recorded, not processed — nothing here moves money, and there is no Stripe
integration. `record_payment()` stores the service amount, tip, method
(cash/card/other), which tech the tip belongs to, and an optional note, then
completes the job in the same call, because the desk does both in one motion
at the counter. One payment row per job; re-recording corrects it.

Commission is **per tech**, held in `tech_pay` rather than on the profile —
RLS is row-level, so a rate stored on `profiles` would be readable by everyone
who can see the roster. A manager sees every rate; a tech sees only their own.
A blank rate falls back to the salon default, so a new hire needs no setup.

`tech_amount` is `(service_amount x split) + tip_amount` — **tips are inside
it**, never split. So `tech_amount + salon_amount = service_total + tip_total`,
and the dashboard shows collected as the headline with to-techs and to-salon as
its two parts, tips noted subordinate to to-techs. Rendering tips as a fourth
peer figure made four numbers in a row that visibly did not add up.

Every payment stores the rate that applied (`split_percent`) plus the
resulting `tech_amount` and `salon_amount`. The split is stored, not derived:
changing the house rate must never rewrite what someone already earned. Tips
are never split — they go to the tech in full.

Managers and admins see the floor's earnings on the dashboard across today,
this week and the current pay period. A tech sees their own take-home over the
same three windows, and payment rows only where the tip is theirs.

Pay periods are a length plus an anchor date (`pay_period_days`,
`pay_period_anchor`), which covers weekly, fortnightly and monthly-ish cycles
without a rules engine.

## Notifications

In-app only. Written by database triggers rather than the app, so a tech is
told about a booking however it was made — front desk, RPC, or SQL console.
Covers appointments assigned, rescheduled, cancelled, and clients placed in
front of a tech.

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

**"Application error: a server-side exception has occurred"** on a deployed
route — almost always schema drift: the deployed build calls a function or
column that the live database doesn't have yet, because a migration was
skipped. Vercel shows only a digest; the real message is in the function logs
(`function public.x does not exist`, `column "y" does not exist`). Fix it by
applying every file in `supabase/migrations/` in order, not by catching the
error. Note that the Supabase SQL editor runs a whole file as one transaction,
so a single failing statement silently rolls the entire file back — check for
an error after each one rather than assuming it took.

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

## Pages by role

Each role gets its own short list of screens — one page, one job, so nothing
needs long scrolling on a tablet.

Navigation is grouped, because eleven identical rows gave the eye nothing to
anchor on. The active item is the brightest thing in the rail — filled surface,
heavier weight, accent edge — while its siblings sit one step down; nothing
needed to get larger for that to work.

| Group | Manager | Admin | Tech |
| --- | --- | --- | --- |
| **Floor** | Today · Walk-ins · Bookings · Staff hours | Today · Walk-ins · Bookings · Staff hours | My turn · My hours |
| **Business** | Services & prices · Team · Reports | Payments | — |
| — | Get started · Settings | — | My earnings · Profile & skills |

Names split on the two axes an owner actually thinks in — clients vs staff, and
now vs later. "Turns & Queue", "Appointments" and "Schedule" all read as the
same concept to someone who does not already know the data model; **Walk-ins**,
**Bookings** and **Staff hours** do not.

Checking a client in is an action, not a place, so it is a primary button on
Today and on Walk-ins rather than a nav row. `/jobs` remains as a route.

`/guide` is a bilingual (EN/VI) walkthrough of every screen written for a
non-technical manager — what each screen is for, how to add, edit and delete a
record naming the actual on-screen buttons, what each badge means, and the
mistakes people actually make. Its content is data in
`src/lib/guide-content.ts`, so adding a screen means adding a section, not
writing markup.

There is no Salons screen. Managing salons from inside the app was removed;
`salon_id` columns remain on every table and default to `current_salon_id()`,
so the multi-tenant structure is intact and a salon switcher can come back
without a migration.

`/earnings` (Reports) is one route that renders by role — a manager sees the
floor, a tech sees their own take-home. `/customers` is reachable from Settings
and the check-in page rather than taking a nav slot.

The sidebar shows from 768px up (both tablet orientations); phones get a bottom
tab bar with a More sheet, where groups are flattened because a five-item bar
has no room for headings and the order already carries the grouping.

### Today on the floor

The dashboard is a control surface, not a report. Top to bottom: the header line
with the counts inline, the client who has waited longest **with inline assign
buttons for every free tech plus a rotation-order "Next up"**, the technician
rail, the rest of the waiting queue with the same inline assign, and money as a
single strip. Assignment happens on this page; nothing here exists only to send
you somewhere else.

## Theming

Two independent axes, and they are never conflated:

| axis | values | who decides |
| --- | --- | --- |
| `data-theme` | `midnight-plum`, `noir` | the salon, overridable per user |
| `data-mode` | `light`, `dark` | the user; defaults to `prefers-color-scheme` |

Every theme is authored for **both** modes. There is no "dark theme" — there is
a theme, rendered in a mode.

**Midnight Plum** is deep plum with a saturated magenta accent. **Noir** is true
neutral greys whose accent is silver-on-ink in dark and ink-on-paper in light,
which makes the action colour the highest-contrast pair in the theme rather than
a hue fighting the background; it doubles as the accessible baseline.

### Tokens

Components reference meaning, never a hue — `bg-surface-raised`, `text-muted`,
`border-strong`, `bg-danger-bg`. There is no `bg-plum-900` and no `text-gray-400`
anywhere in `src/`; a grep for raw Tailwind colour utilities returns nothing.

The contract is documented at the top of `src/app/globals.css`: surfaces
(canvas / raised / overlay / sunken), text (primary / secondary / muted /
on-accent), borders (subtle / default / strong), accent (default / hover /
subtle-bg / on-accent) and four status families, each with `fg`, `bg` and
`border`.

Adding a theme is two steps and touches no component:

1. Two CSS blocks in `globals.css`, scoped to
   `[data-theme="…"][data-mode="dark"|"light"]`, defining only the contract
   tokens.
2. One entry in `THEMES` in `src/lib/theme.ts`, with the swatch colours the
   picker draws.

Theme blocks define *only* the primitives. Everything else — the shadcn aliases
(`--card`, `--muted`, `--primary`), radii, the type scale — is defined once,
globally, in terms of those primitives, which is what keeps step 1 sufficient.
If a new theme would need a component change, a token is missing; add the token.

Two naming hazards are worth knowing, both the same bug class. A `--color-x`
entry mints a `text-x` utility that silently shadows a same-named Tailwind font
size or palette. `--base` is therefore *not* exposed as `--color-base`
(`text-base` must stay a font size), and the old `--color-sky` / `--color-mint`
tokens were removed because they shadowed Tailwind's built-in palettes.

### Selection, persistence and first paint

Resolution is **user override → salon default → midnight plum**, and mode
defaults to `system`. Both are stored in Supabase (`profiles.theme`,
`profiles.mode`, `salons.default_theme`) and mirrored to `localStorage` and
cookies.

No flash, by construction:

1. The server reads the appearance cookies and renders `data-theme` /
   `data-mode` straight onto `<html>`, so correct markup arrives already themed.
2. A small synchronous script in `<head>` reconciles against `localStorage` —
   which wins, being this device's own choice — and resolves `system` from
   `prefers-color-scheme`. It runs before `<body>` exists, so anything it
   corrects is corrected before the browser has anything to paint.

The cookies are stamped at sign-in, when the profile and salon are both in hand.
Switching theme or mode applies instantly with no reload; the Supabase write is
fire-and-forget and deliberately does *not* use `requireSession()`, because a
background write must never redirect the app out from under a tap.

### Contrast

`node scripts/contrast-audit.mjs` parses the shipped `globals.css` — not a
duplicate of the palette — converts every OKLCH value to sRGB and checks all
four theme × mode combinations against WCAG AA: 4.5:1 for body text, 3:1 for
large text and UI boundaries. It exits non-zero on a regression, so it works as
a check. `--md` emits a markdown table.

`--border-subtle` is reported as decorative and exempt: it is a hairline *inside*
a surface that never carries state or marks a control boundary, so 1.4.11 does
not apply. `--border-default` and `--border-strong`, which do both, are held to
3:1.

## Wait escalation

How long a client has waited is the number on this product that gets worse on
its own, so it is the one that escalates:

| waited | treatment |
| --- | --- |
| under 15 min | neutral |
| 15–30 min | warning tokens |
| 30–45 min | danger tokens |
| over 45 min | danger tokens, the whole row tinted, and a pulsing marker |

The mapping lives in one place — `waitStatus(minutes)` in `src/lib/wait.ts` — so
a client who is urgent on the dashboard cannot look routine on the queue. Timers
tick live on a 20-second interval without a refresh.

## Structure

```
src/
├── app/
│   ├── (app)/                 authenticated shell (header + tab bar + realtime)
│   │   ├── dashboard/         manager floor view
│   │   ├── tech/              tech view: current job + turn position
│   │   ├── schedule/          day/week grid: shifts + bookings
│   │   ├── jobs/              create + list
│   │   ├── appointments/      day view + booking
│   │   ├── customers/         profiles
│   │   ├── guide/             Get Started (EN/VI)
│   │   └── settings/          salon + team
│   ├── login/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                    shadcn/ui primitives
│   ├── dashboard/             tech rail, inline assign controls
│   ├── schedule/              grid, lane layout, slot dialog
│   ├── theme-provider.tsx     the two appearance axes
│   ├── theme-picker.tsx       swatch rack, mode toggle
│   ├── live-wait.tsx          ticking wait pills and row tints
│   ├── turn-board.tsx         the rotation board
│   ├── job-card.tsx           one client on the floor
│   ├── motion.tsx             shared transitions (reduced-motion aware)
│   ├── guide-browser.tsx      sectioned Get Started reader
│   └── realtime-refresher.tsx
├── lib/
│   ├── actions/               server actions (auth, jobs, customers, …)
│   ├── guide-content.ts       bilingual guide copy as data
│   ├── theme.ts               theme registry + pre-paint script
│   ├── wait.ts                minutes → escalation, in one place
│   ├── supabase/              server / browser / admin / middleware clients
│   ├── types/                 generated DB types + domain types
│   ├── turn.ts                turn management
│   ├── queries.ts             shared reads
│   └── auth.ts                session context + guards
└── middleware.ts              session refresh + route gating

scripts/
└── contrast-audit.mjs         WCAG AA over every theme × mode
```
