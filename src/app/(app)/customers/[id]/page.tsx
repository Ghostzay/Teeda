import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Cake,
  Footprints,
  Mail,
  Phone,
  ShieldAlert,
  StickyNote,
  UserRound,
} from "lucide-react";

import { ClientDetailsForm } from "@/components/client-details-form";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFloorAccess } from "@/lib/auth";
import { formatDate, formatMoney, formatPhone, formatTime, initials } from "@/lib/format";
import {
  getActiveTechs,
  getClientHistory,
  getClientSummary,
  getCustomer,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * One client, in full.
 *
 * The list answers "do we have them?"; this answers "who are they and what
 * have we done for them?" — which is the question a tech has before they start
 * and the desk has when the phone rings.
 */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireFloorAccess();
  const { id } = await params;

  const [customer, history, summary, techs] = await Promise.all([
    getCustomer(id),
    getClientHistory(id),
    getClientSummary(id),
    getActiveTechs(),
  ]);

  if (!customer) notFound();

  const upcoming = history.filter((entry) => entry.is_future);
  const past = history.filter((entry) => !entry.is_future);
  const preferred = techs.find((tech) => tech.id === customer.preferred_tech_id);

  return (
    <div className="space-y-5">
      <Link
        href="/customers"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-default underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" />
        All clients
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-accent-default text-xl font-semibold text-on-accent">
          {initials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-display">{customer.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-text">
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1.5 hover:text-primary-text"
              >
                <Phone className="size-3.5" />
                {formatPhone(customer.phone)}
              </a>
            ) : null}
            {customer.email ? (
              <a
                href={`mailto:${customer.email}`}
                className="inline-flex items-center gap-1.5 hover:text-primary-text"
              >
                <Mail className="size-3.5" />
                {customer.email}
              </a>
            ) : null}
            {customer.birthday ? (
              <span className="inline-flex items-center gap-1.5">
                <Cake className="size-3.5" />
                {formatDate(customer.birthday)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-3.5" />
              Client since {formatDate(customer.created_at)}
            </span>
          </div>
        </div>
      </header>

      {/* Allergies sit above everything, in danger tokens. A tech needs this
          before they start, not buried three cards down. */}
      {customer.allergies ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger-border bg-danger-bg px-4 py-3 text-danger">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold leading-tight">Allergies and sensitivities</p>
            <p className="text-sm">{customer.allergies}</p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Visits" value={String(summary?.visits ?? 0)} />
        <Stat label="Lifetime spend" value={formatMoney(summary?.lifetime_spend ?? 0)} />
        <Stat label="Tips given" value={formatMoney(summary?.lifetime_tips ?? 0)} />
        <Stat
          label="Last visit"
          value={summary?.last_visit ? formatDate(summary.last_visit) : "Never"}
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-5">
          <section aria-label="Coming up" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-title">Coming up</h2>
              <span className="text-meta text-muted-text tabular-nums">{upcoming.length}</span>
            </div>
            {upcoming.length === 0 ? (
              <p className="rounded-2xl border border-subtle bg-surface-raised px-4 py-6 text-center text-sm text-muted-text">
                Nothing booked. Add one from Bookings.
              </p>
            ) : (
              <Stagger className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
                {upcoming.map((entry) => (
                  <StaggerItem key={`${entry.kind}-${entry.id}`}>
                    <HistoryRow entry={entry} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </section>

          <section aria-label="Past visits" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-title">Past visits</h2>
              <span className="text-meta text-muted-text tabular-nums">{past.length}</span>
            </div>
            {past.length === 0 ? (
              <p className="rounded-2xl border border-subtle bg-surface-raised px-4 py-6 text-center text-sm text-muted-text">
                No visits recorded yet.
              </p>
            ) : (
              <Stagger className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
                {past.map((entry) => (
                  <StaggerItem key={`${entry.kind}-${entry.id}`}>
                    <HistoryRow entry={entry} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Fact
                label="Usually sees"
                value={summary?.favourite_tech ?? "No pattern yet"}
              />
              <Fact
                label="Usually books"
                value={summary?.favourite_service ?? "No pattern yet"}
              />
              <Fact
                label="Asks for"
                value={preferred?.full_name ?? "No preference set"}
              />
              <Fact
                label="First visit"
                value={summary?.first_visit ? formatDate(summary.first_visit) : "Not yet"}
              />
              {customer.notes ? (
                <div className="flex items-start gap-2 border-t border-subtle pt-3">
                  <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-text" />
                  <p className="text-secondary-text">{customer.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {session.canManageFloor ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Client details</CardTitle>
              </CardHeader>
              <CardContent>
                <ClientDetailsForm customer={customer} techs={techs} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-subtle bg-surface-raised p-4">
      <p className="text-metric-sm tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-meta text-muted-text">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-text">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function HistoryRow({
  entry,
}: {
  entry: Awaited<ReturnType<typeof getClientHistory>>[number];
}) {
  const isBooking = entry.kind === "appointment";
  const Icon = isBooking ? CalendarClock : Footprints;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Icon className={cn("size-4 shrink-0", isBooking ? "text-info" : "text-muted-text")} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-tight">{entry.service_name}</p>
        <p className="truncate text-meta text-muted-text">
          {formatDate(entry.at)} at {formatTime(entry.at)} · {entry.tech_name}
        </p>
        {entry.notes ? (
          <p className="truncate text-meta text-muted-text">{entry.notes}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        {entry.paid ? (
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(Number(entry.amount) + Number(entry.tip))}
          </p>
        ) : null}
        <Badge variant={isBooking ? "waiting" : entry.paid ? "completed" : "cancelled"}>
          {isBooking ? entry.status : entry.paid ? "Paid" : "Unpaid"}
        </Badge>
      </div>
    </div>
  );
}
