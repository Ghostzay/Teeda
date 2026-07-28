"use client";

import { ArrowRight, UserRound } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { StaggerItem } from "@/components/motion";
import { assignJobAction, assignNextTechAction } from "@/lib/actions/jobs";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FreeTech = {
  tech_id: string;
  full_name: string;
  queue_position: number | null;
};

/**
 * Assignment, in place.
 *
 * The point of the dashboard rebuild: a manager sees who is waiting and hands
 * them to someone without navigating anywhere. Each free tech is a button; the
 * rotation's own answer is the first and most prominent one, so following the
 * fair order stays the path of least effort.
 */
export function AssignControls({
  jobId,
  freeTechs,
  size = "default",
  className,
}: {
  jobId: string;
  freeTechs: FreeTech[];
  size?: "default" | "compact";
  className?: string;
}) {
  if (freeTechs.length === 0) {
    return (
      <p className={cn("text-sm text-muted-text", className)}>
        Nobody is free right now — this client waits for the next tech to finish.
      </p>
    );
  }

  const compact = size === "compact";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ActionButton
        action={assignNextTechAction}
        fields={{ job_id: jobId }}
        size={compact ? "sm" : "default"}
        className="shrink-0"
      >
        <ArrowRight className="size-4" />
        Next up
      </ActionButton>

      {freeTechs.map((tech) => (
        <ActionButton
          key={tech.tech_id}
          action={assignJobAction}
          fields={{ job_id: jobId, tech_id: tech.tech_id }}
          variant="outline"
          size={compact ? "sm" : "default"}
          className="shrink-0"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-accent-subtle text-[0.625rem] font-bold text-accent-default">
            {initials(tech.full_name)}
          </span>
          {compact ? tech.full_name.split(" ")[0] : tech.full_name}
        </ActionButton>
      ))}
    </div>
  );
}

/** The same control set, staggered in, for the queue rows below the hero. */
export function AssignRow({
  jobId,
  freeTechs,
  children,
  rowClass,
}: {
  jobId: string;
  freeTechs: FreeTech[];
  children: React.ReactNode;
  rowClass?: string;
}) {
  return (
    <StaggerItem>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border border-subtle px-3 py-2.5",
          rowClass || "bg-surface-raised",
        )}
      >
        <UserRound className="size-4 shrink-0 text-muted-text" aria-hidden />
        {children}
        <AssignControls
          jobId={jobId}
          freeTechs={freeTechs}
          size="compact"
          className="ml-auto justify-end"
        />
      </div>
    </StaggerItem>
  );
}
