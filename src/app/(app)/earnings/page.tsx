import Link from "next/link";

import { SalonEarningsCard, TechEarningsCard } from "@/components/earnings";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { getJobs, getPaymentTotals, getSalonEarnings, getTechEarnings } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SCOPES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "period", label: "Pay period" },
] as const;

/**
 * One route, two audiences: the floor's numbers for a manager or admin, and
 * their own take-home for a tech. RLS enforces the difference either way.
 */
export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await requireSession();
  const { scope: raw } = await searchParams;
  const scope: "today" | "week" | "period" =
    raw === "week" || raw === "period" ? raw : "today";

  if (!session.canManageFloor) {
    const [earnings, completed] = await Promise.all([
      getTechEarnings(session.userId),
      getJobs({ statuses: ["completed"], techId: session.userId, todayOnly: true }),
    ]);

    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">My earnings</h1>
          <p className="text-sm text-muted-foreground">
            You keep {earnings.today?.split_percent ?? session.salon.tech_split_percent}% of
            services, plus every tip.
          </p>
        </header>

        <TechEarningsCard earnings={earnings} />

        {completed.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Today&apos;s clients ({completed.length})
              </p>
              <ul className="divide-y divide-border">
                {completed.map((job) => (
                  <li key={job.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {job.customer?.name ?? "Walk-in"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{job.service_name}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-completed">
                      {job.payment ? formatMoney(job.payment.tech_amount) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  const [rows, totals] = await Promise.all([getSalonEarnings(scope), getPaymentTotals()]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Earnings &amp; reports</h1>
          <p className="text-sm text-muted-foreground">
            {formatMoney(Number(totals.service_total) + Number(totals.tip_total))} collected today
            across {totals.payment_count} {totals.payment_count === 1 ? "payment" : "payments"}.
          </p>
        </div>
        <Link
          href="/payments"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Take a payment →
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {SCOPES.map((option) => (
          <Link
            key={option.key}
            href={`/earnings?scope=${option.key}`}
            className={cn(
              "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              option.key === scope
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <SalonEarningsCard rows={rows} scope={scope} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Cash today" value={formatMoney(totals.cash_total)} />
        <Figure label="Card today" value={formatMoney(totals.card_total)} />
        <Figure label="Tips today" value={formatMoney(totals.tip_total)} tone="waiting" />
        <Figure label="Salon today" value={formatMoney(totals.salon_total)} tone="completed" />
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "waiting" | "completed";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p
          className={cn(
            "text-xl font-semibold leading-none tabular-nums",
            tone === "waiting" && "text-waiting",
            tone === "completed" && "text-completed",
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
