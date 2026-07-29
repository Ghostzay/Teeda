import { CheckCircle2, Receipt } from "lucide-react";

import { PaymentDialog } from "@/components/payment-dialog";
import { formatTime } from "@/lib/format";
import type { JobWithRelations, Profile, ServiceMenuItem } from "@/lib/types";

/**
 * Finished jobs with no payment recorded, as a working list.
 *
 * "Needs attention" already counts them; this is the panel you settle them
 * from, for a desk that would rather clear the backlog here than walk to
 * Payments and back.
 */
export function UnpaidTickets({
  jobs,
  techs,
  services,
  splitPercent,
}: {
  jobs: JobWithRelations[];
  techs: Profile[];
  services: ServiceMenuItem[];
  splitPercent: number;
}) {
  return (
    <section aria-label="Unpaid tickets" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-title">Unpaid tickets</h2>
        <span className="text-meta text-muted-text tabular-nums">{jobs.length}</span>
      </div>

      {jobs.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-success-border bg-success-bg px-4 py-3 text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <p className="text-sm font-medium">Everything finished today has been paid for.</p>
        </div>
      ) : (
        <ul className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning">
                <Receipt className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">
                  {job.customer?.name ?? "Walk-in"}
                </p>
                <p className="truncate text-meta text-muted-text">
                  {formatTime(job.completed_at)} · {job.service_name}
                  {job.tech?.full_name ? ` · ${job.tech.full_name}` : ""}
                </p>
              </div>
              <PaymentDialog
                job={job}
                techs={techs}
                services={services}
                splitPercent={splitPercent}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
