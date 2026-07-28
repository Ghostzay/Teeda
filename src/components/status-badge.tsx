import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_STATUS_LABEL,
  JOB_STATUS_LABEL,
  type AppointmentStatus,
  type JobStatus,
} from "@/lib/types";

const DOT: Record<JobStatus, string> = {
  waiting: "bg-waiting",
  in_progress: "bg-progress animate-status-pulse",
  completed: "bg-completed",
  cancelled: "bg-cancelled",
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <Badge variant={status} className={className}>
      <span className={cn("size-1.5 rounded-full", DOT[status])} aria-hidden />
      {JOB_STATUS_LABEL[status]}
    </Badge>
  );
}

const APPOINTMENT_VARIANT: Record<AppointmentStatus, "waiting" | "in_progress" | "completed" | "cancelled"> = {
  scheduled: "waiting",
  checked_in: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={APPOINTMENT_VARIANT[status]}>{APPOINTMENT_STATUS_LABEL[status]}</Badge>;
}

/** Left color rail on job cards — status readable at arm's length. */
export const STATUS_RAIL: Record<JobStatus, string> = {
  waiting: "border-l-4 border-l-[var(--status-waiting)]",
  in_progress: "border-l-4 border-l-[var(--status-progress)]",
  completed: "border-l-4 border-l-[var(--status-completed)]",
  cancelled: "border-l-4 border-l-[var(--status-cancelled)]",
};
