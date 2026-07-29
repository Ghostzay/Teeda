import { Receipt } from "lucide-react";

import { PaymentDialog } from "@/components/payment-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFloorAccess } from "@/lib/auth";
import { formatMoney, formatTime } from "@/lib/format";
import { getActiveTechs, getPaymentTotals, getRecentlyCompleted, getServiceMenu } from "@/lib/queries";
import { PAYMENT_METHOD_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Payments — today's till, with anything still owing at the top. */
export default async function PaymentsPage() {
  const session = await requireFloorAccess();

  const [finished, techs, services, totals] = await Promise.all([
    getRecentlyCompleted(50),
    getActiveTechs(),
    getServiceMenu(),
    getPaymentTotals(),
  ]);

  const unpaid = finished.filter((job) => !job.payment);
  const paid = finished.filter((job) => job.payment);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          {formatMoney(Number(totals.service_total) + Number(totals.tip_total))} collected today ·{" "}
          {formatMoney(totals.tip_total)} in tips
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Cash" value={formatMoney(totals.cash_total)} />
        <Figure label="Card" value={formatMoney(totals.card_total)} />
        <Figure label="To techs" value={formatMoney(totals.tech_total)} tone="waiting" />
        <Figure label="To salon" value={formatMoney(totals.salon_total)} tone="completed" />
      </div>

      <Card className={cn(unpaid.length > 0 && "border-2 border-[var(--status-waiting)]")}>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-4 text-waiting" />
            Awaiting payment
            <span className="rounded-full bg-waiting-bg px-2 py-0.5 text-xs font-semibold tabular-nums text-waiting">
              {unpaid.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {unpaid.length === 0 ? (
            <EmptyState icon={Receipt} title="Everything today is paid up." className="py-6" />
          ) : (
            <ul className="divide-y divide-border">
              {unpaid.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{job.customer?.name ?? "Walk-in"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.service_name} · {job.tech?.full_name ?? "Unassigned"} ·{" "}
                      {formatTime(job.completed_at)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <PaymentDialog
                      job={job}
                      techs={techs}
                      services={services}
                      splitPercent={session.salon.tech_split_percent}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Paid today ({paid.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {paid.length === 0 ? (
            <EmptyState icon={Receipt} title="No payments recorded yet." className="py-6" />
          ) : (
            <ul className="divide-y divide-border">
              {paid.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{job.customer?.name ?? "Walk-in"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.tech?.full_name ?? "Unassigned"} ·{" "}
                      {job.payment ? PAYMENT_METHOD_LABEL[job.payment.method] : ""} ·{" "}
                      {formatTime(job.completed_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-completed">
                      {formatMoney(
                        Number(job.payment?.service_amount ?? 0) +
                          Number(job.payment?.tip_amount ?? 0),
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(job.payment?.tech_amount ?? 0)} to tech
                    </p>
                  </div>
                  <div className="shrink-0">
                    <PaymentDialog
                      job={job}
                      techs={techs}
                      services={services}
                      splitPercent={session.salon.tech_split_percent}
                      variant="ghost"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
