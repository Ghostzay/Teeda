import { CalendarClock, Check, Footprints, Phone, Receipt, StickyNote, UserRound, X } from "lucide-react";

import { ActionButton, ActionSelect } from "@/components/action-button";
import { PaymentDialog } from "@/components/payment-dialog";
import { STATUS_RAIL, StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import {
  assignJobAction,
  assignNextTechAction,
  cancelJobAction,
  completeJobAction,
  skipJobAction,
  startJobAction,
} from "@/lib/actions/jobs";
import { formatDuration, formatMoney, formatPhone, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABEL,
  SKILL_LABEL,
  type JobWithRelations,
  type Profile,
  type Service,
} from "@/lib/types";

/**
 * One client on the floor. Status is legible three ways — colour rail, badge
 * and elapsed timer — so a manager can read the room at a glance.
 *
 * Button wording is deliberately literal about what happens next:
 *   "Accept" / "Pass"          a tech taking or declining their turn
 *   "Start appointment"        a booked client whose tech is starting work
 *   "Take payment"             the desk closing the client out
 */
export function JobCard({
  job,
  techs,
  services,
  splitPercent,
  canManageFloor,
  currentUserId,
  showTurnActions = false,
  className,
}: {
  job: JobWithRelations;
  techs: Profile[];
  /** The salon menu, for the checkout cart. Empty for tech-facing cards. */
  services: Service[];
  splitPercent: number;
  canManageFloor: boolean;
  currentUserId: string;
  /** Renders the large Accept / Pass pair — the tech's own queue. */
  showTurnActions?: boolean;
  className?: string;
}) {
  const isMine = job.tech_id === currentUserId;
  const canWork = canManageFloor || isMine || (job.tech_id === null && job.status === "waiting");
  const isBooked = job.type === "appointment";

  const elapsed =
    job.status === "in_progress"
      ? `Working ${formatDuration(job.started_at)}`
      : job.status === "waiting"
        ? `Waiting ${formatDuration(job.checked_in_at)}`
        : `Finished ${formatTime(job.completed_at)}`;

  const startLabel = isBooked ? "Start appointment" : "Start service";

  return (
    <Card className={cn("overflow-hidden", STATUS_RAIL[job.status], className)}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">
              {job.customer?.name ?? "Walk-in"}
            </p>
            <p className="truncate text-sm text-muted-foreground">{job.service_name}</p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {isBooked ? <CalendarClock className="size-3.5" /> : <Footprints className="size-3.5" />}
            {isBooked ? "Booked appointment" : "Walk-in"}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3.5" />
            {job.tech?.full_name ?? "Nobody yet"}
          </span>
          {job.customer?.phone ? (
            <a
              href={`tel:${job.customer.phone}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="size-3.5" />
              {formatPhone(job.customer.phone)}
            </a>
          ) : null}
          <span className="font-medium tabular-nums">{elapsed}</span>
          {job.required_skills.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5">
              Needs {job.required_skills.map((skill) => SKILL_LABEL[skill]).join(" + ")}
            </span>
          ) : null}
        </div>

        {job.notes ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <StickyNote className="mt-0.5 size-3.5 shrink-0" />
            {job.notes}
          </p>
        ) : null}

        {job.photo_url ? (
          // Storage URLs are arbitrary per-project hosts; a plain img avoids
          // pinning next/image remote patterns to a build-time env var.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.photo_url}
            alt={`Reference for ${job.service_name}`}
            className="h-32 w-full rounded-lg object-cover"
          />
        ) : null}

        {/* Payment summary, once recorded. Techs only see this on their own jobs. */}
        {job.payment ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-completed/30 bg-completed-bg/60 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-completed">
              <Receipt className="size-3.5" />
              {formatMoney(Number(job.payment.service_amount) + Number(job.payment.tip_amount))} paid
            </span>
            <span className="text-xs text-muted-foreground">
              {formatMoney(job.payment.service_amount)} service ·{" "}
              {formatMoney(job.payment.tip_amount)} tip · {PAYMENT_METHOD_LABEL[job.payment.method]}
              {canManageFloor
                ? ` · ${formatMoney(job.payment.tech_amount)} to tech`
                : ` · ${formatMoney(job.payment.tech_amount)} yours`}
            </span>
          </div>
        ) : null}

        {/* The tech's own turn: two large, unmistakable choices. */}
        {showTurnActions && job.status === "waiting" && isMine ? (
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              action={startJobAction}
              fields={{ job_id: job.id, tech_id: currentUserId }}
              size="lg"
              className="[&>button]:h-16 [&>button]:w-full [&>button]:text-base"
            >
              <Check className="size-5" />
              Accept
            </ActionButton>
            <ActionButton
              action={skipJobAction}
              fields={{ job_id: job.id }}
              variant="outline"
              size="lg"
              confirm="Pass on this client? You'll move to the back of the rotation."
              className="[&>button]:h-16 [&>button]:w-full [&>button]:text-base"
            >
              <X className="size-5" />
              Pass
            </ActionButton>
          </div>
        ) : null}

        {job.status === "waiting" || job.status === "in_progress" ? (
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "waiting" && canWork && !(showTurnActions && isMine) ? (
              <ActionButton
                action={startJobAction}
                fields={{ job_id: job.id, tech_id: canManageFloor ? job.tech_id : currentUserId }}
                size="lg"
                className="flex-1 [&>button]:w-full"
              >
                {startLabel}
              </ActionButton>
            ) : null}

            {job.status === "waiting" && !job.tech_id && canManageFloor ? (
              <ActionButton
                action={assignNextTechAction}
                fields={{ job_id: job.id }}
                variant="outline"
                size="lg"
                className="flex-1 [&>button]:w-full"
              >
                Give to next in rotation
              </ActionButton>
            ) : null}

            {job.status === "in_progress" && canManageFloor ? (
              <PaymentDialog job={job} techs={techs} services={services} splitPercent={splitPercent} />
            ) : null}

            {job.status === "in_progress" && canWork && !canManageFloor ? (
              <ActionButton
                action={completeJobAction}
                fields={{ job_id: job.id }}
                variant="success"
                size="lg"
                className="flex-1 [&>button]:w-full"
              >
                Finish
              </ActionButton>
            ) : null}

            {canManageFloor ? (
              <ActionButton
                action={cancelJobAction}
                fields={{ job_id: job.id }}
                variant="ghost"
                size="lg"
                confirm="Cancel this client?"
              >
                Cancel
              </ActionButton>
            ) : null}
          </div>
        ) : null}

        {/* Finished but unpaid — the desk still needs to take money. */}
        {job.status === "completed" && canManageFloor && !job.payment ? (
          <PaymentDialog
            job={job}
            techs={techs}
            services={services}
            splitPercent={splitPercent}
            variant="outline"
          />
        ) : null}

        {/* Manual override: the suggestion is a default, never a lock-in. */}
        {canManageFloor && job.status === "waiting" ? (
          <ActionSelect
            action={assignJobAction}
            fields={{ job_id: job.id }}
            name="tech_id"
            value={job.tech_id ?? "unassigned"}
            aria-label={`Assign a tech to ${job.customer?.name ?? "this client"}`}
          >
            <option value="unassigned">Nobody yet — any tech can claim</option>
            {techs.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}
              </option>
            ))}
          </ActionSelect>
        ) : null}
      </div>
    </Card>
  );
}
