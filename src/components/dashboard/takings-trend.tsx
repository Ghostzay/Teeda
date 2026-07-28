import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { formatMoney } from "@/lib/format";
import type { TakingsComparison } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Today against the same weekday last week.
 *
 * A running total says nothing on its own — $815 is a good Tuesday and a poor
 * Saturday. The comparison is the part that answers the question an owner is
 * actually asking.
 *
 * Same weekday rather than yesterday, because a salon's week has a shape;
 * comparing Monday to Sunday would show an alarming drop every week.
 */
export function TakingsTrend({ data }: { data: TakingsComparison }) {
  const today = Number(data.today_total);
  const before = Number(data.compared_total);
  const delta = today - before;
  const pct = before > 0 ? Math.round((delta / before) * 100) : null;

  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  const weekday = new Date(`${data.compared_day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
  });

  return (
    <section
      aria-label="Today compared with last week"
      className="space-y-3 rounded-2xl border border-subtle bg-surface-raised p-4"
    >
      <h2 className="text-title">Today vs. last week</h2>

      <div>
        <p className="text-metric tabular-nums leading-none">{formatMoney(today)}</p>
        <p className="text-meta text-muted-text">taken so far today</p>
      </div>

      {before === 0 ? (
        <p className="rounded-xl border border-subtle bg-surface-sunken p-3 text-sm text-muted-text">
          Nothing was taken last {weekday}, so there is nothing to compare against yet.
        </p>
      ) : (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl border px-3 py-2",
            direction === "up"
              ? "border-success-border bg-success-bg text-success"
              : direction === "down"
                ? "border-warning-border bg-warning-bg text-warning"
                : "border-subtle bg-surface-sunken text-muted-text",
          )}
        >
          <Icon className="size-4 shrink-0" />
          <p className="text-sm font-semibold">
            {pct !== null ? `${delta >= 0 ? "+" : ""}${pct}%` : "—"} vs last {weekday}
          </p>
          <p className="ml-auto text-sm tabular-nums">{formatMoney(before)}</p>
        </div>
      )}

      <p className="text-meta text-muted-text tabular-nums">
        {data.today_clients} {data.today_clients === 1 ? "client" : "clients"} today ·{" "}
        {data.compared_clients} last {weekday}
      </p>
    </section>
  );
}
