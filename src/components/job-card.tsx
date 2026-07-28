import { CalendarClock, Footprints, Phone, StickyNote, UserRound } from "lucide-react";

import { ActionButton, ActionSelect } from "@/components/action-button";
import { STATUS_RAIL, StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import {
  assignJobAction,
  assignNextTechAction,
  cancelJobAction,
  completeJobAction,
  startJobAction,
} from "@/lib/actions/jobs";
import { formatDuration, formatPhone, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { JobWithRelations, Profile } from "@/lib/types";

/**
 * One client on the floor. Status is legible three ways — color rail, badge,
 * and the elapsed timer — so a manager can read the room at a glance.
 */
export function JobCard({
  job,
  techs,
  isManager,
  currentUserId,
  className,
}: {
  job: JobWithRelations;
  techs: Profile[];
  isManager: boolean;
  currentUserId: string;
  className?: string;
}) {
  const isMine = job.tech_id === currentUserId;
  const canWork = isManager || isMine || (job.tech_id === null && job.status === "waiting");
  const isOpen = job.status === "waiting" || job.status === "in_progress";

  const elapsed =
    job.status === "in_progress"
      ? `Working ${formatDuration(job.started_at)}`
      : job.status === "waiting"
        ? `Waiting ${formatDuration(job.checked_in_at)}`
        : `Finished ${formatTime(job.completed_at)}`;

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
            {job.type === "appointment" ? (
              <CalendarClock className="size-3.5" />
            ) : (
              <Footprints className="size-3.5" />
            )}
            {job.type === "appointment" ? "Appointment" : "Walk-in"}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3.5" />
            {job.tech?.full_name ?? "Unassigned"}
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

        {isOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "waiting" && canWork ? (
              <ActionButton
                action={startJobAction}
                fields={{ job_id: job.id, tech_id: isManager ? job.tech_id : currentUserId }}
                size="lg"
                className="flex-1 [&>button]:w-full"
              >
                Start
              </ActionButton>
            ) : null}

            {job.status === "waiting" && !job.tech_id && isManager ? (
              <ActionButton
                action={assignNextTechAction}
                fields={{ job_id: job.id }}
                variant="outline"
                size="lg"
                className="flex-1 [&>button]:w-full"
              >
                Assign next up
              </ActionButton>
            ) : null}

            {job.status === "in_progress" && canWork ? (
              <ActionButton
                action={completeJobAction}
                fields={{ job_id: job.id }}
                variant="success"
                size="lg"
                className="flex-1 [&>button]:w-full"
              >
                Complete
              </ActionButton>
            ) : null}

            {isManager ? (
              <ActionButton
                action={cancelJobAction}
                fields={{ job_id: job.id }}
                variant="ghost"
                size="lg"
                confirm="Cancel this job?"
              >
                Cancel
              </ActionButton>
            ) : null}
          </div>
        ) : null}

        {/* Manual override: the suggestion is a default, never a lock-in. */}
        {isManager && job.status === "waiting" ? (
          <ActionSelect
            action={assignJobAction}
            fields={{ job_id: job.id }}
            name="tech_id"
            value={job.tech_id ?? "unassigned"}
            aria-label={`Assign a tech to ${job.customer?.name ?? "this job"}`}
          >
            <option value="unassigned">Unassigned — anyone can claim</option>
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
