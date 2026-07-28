import { CalendarRange, HandCoins, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SalonEarningsRow, TechEarnings } from "@/lib/types";

/**
 * A tech's take-home, over the three windows they actually ask about:
 * today, this week, and the current pay period.
 */
export function TechEarningsCard({ earnings }: { earnings: TechEarnings }) {
  const today = earnings.today;
  const split = Number(today?.split_percent ?? 60);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            My earnings
          </CardTitle>
          <CardDescription>
            Your rate is {split}% of services, plus every tip in full.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Today reads largest — it's the number they check between clients. */}
        <div className="rounded-xl bg-completed-bg px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-completed">Today</p>
          <p className="text-3xl font-semibold leading-tight tabular-nums text-completed">
            {formatMoney(today?.tech_total ?? 0)}
          </p>
          <p className="text-sm text-muted-foreground">
            {today?.services_count ?? 0} {today?.services_count === 1 ? "client" : "clients"} ·{" "}
            {formatMoney(today?.tip_total ?? 0)} in tips
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Window
            icon={TrendingUp}
            label="This week"
            amount={earnings.week?.tech_total ?? 0}
            count={earnings.week?.services_count ?? 0}
            tips={earnings.week?.tip_total ?? 0}
          />
          <Window
            icon={CalendarRange}
            label="Pay period"
            amount={earnings.period?.tech_total ?? 0}
            count={earnings.period?.services_count ?? 0}
            tips={earnings.period?.tip_total ?? 0}
            since={earnings.period?.period_start}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Window({
  icon: Icon,
  label,
  amount,
  count,
  tips,
  since,
}: {
  icon: typeof Wallet;
  label: string;
  amount: number;
  count: number;
  tips: number;
  since?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="text-2xl font-semibold leading-tight tabular-nums">{formatMoney(amount)}</p>
      <p className="text-xs text-muted-foreground">
        {count} {count === 1 ? "client" : "clients"} · {formatMoney(tips)} tips
      </p>
      {since ? <p className="mt-0.5 text-xs text-muted-foreground">since {formatDate(since)}</p> : null}
    </div>
  );
}

/**
 * Manager overview: every tech's performance side by side, so the split
 * between house and floor is visible in one place.
 */
export function SalonEarningsCard({
  rows,
  scope,
}: {
  rows: SalonEarningsRow[];
  scope: "today" | "week" | "period";
}) {
  const worked = rows.filter((row) => row.services_count > 0);

  const totals = rows.reduce(
    (sum, row) => ({
      services: sum.services + row.services_count,
      revenue: sum.revenue + Number(row.service_total) + Number(row.tip_total),
      tech: sum.tech + Number(row.tech_total),
      salon: sum.salon + Number(row.salon_total),
    }),
    { services: 0, revenue: 0, tech: 0, salon: 0 },
  );

  const scopeLabel = scope === "today" ? "Today" : scope === "week" ? "This week" : "Pay period";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="size-4 text-primary" />
          Earnings — {scopeLabel.toLowerCase()}
        </CardTitle>
        <span className="text-sm font-semibold tabular-nums">{formatMoney(totals.revenue)}</span>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-3 gap-px border-y border-border bg-border">
          <Total label="Clients" value={String(totals.services)} />
          <Total label="To techs" value={formatMoney(totals.tech)} tone="waiting" />
          <Total label="To salon" value={formatMoney(totals.salon)} tone="completed" />
        </div>

        {worked.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing recorded yet" className="py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {worked.map((row) => (
              <li key={row.tech_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{row.full_name}</p>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                      {row.commission_percent}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.services_count} {row.services_count === 1 ? "client" : "clients"} ·{" "}
                    {formatMoney(row.service_total)} services · {formatMoney(row.tip_total)} tips
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{formatMoney(row.tech_total)}</p>
                  <p className="text-xs text-muted-foreground">
                    salon {formatMoney(row.salon_total)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "waiting" | "completed";
}) {
  return (
    <div className="bg-card px-3 py-3 text-center">
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "waiting" && "text-waiting",
          tone === "completed" && "text-completed",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
