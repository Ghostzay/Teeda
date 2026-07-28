import { Clock, Crown } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { resetTurnAction } from "@/lib/actions/salon";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TurnQueueEntry } from "@/lib/types";

/**
 * The rotation board — the most prominent thing on every screen that shows it.
 *
 * Read top to bottom: whoever sits at #1 and is free takes the next client.
 * `last_turn_at` is on every row so the order is auditable by anyone standing
 * at the desk — the point is that nobody has to take it on faith.
 */
export function TurnBoard({
  queue,
  highlightTechId,
  showResetControl = false,
}: {
  queue: TurnQueueEntry[];
  highlightTechId?: string;
  showResetControl?: boolean;
}) {
  const nextUp = queue.find((entry) => !entry.is_busy);

  return (
    <Card className="border-2 border-primary/25 shadow-md">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border bg-primary/5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Crown className="size-5 text-primary" />
          Turn rotation
        </CardTitle>
        <span className="text-xs font-medium text-muted-foreground">Oldest turn goes first</span>
      </CardHeader>

      {/* Who's up, stated once in plain words before the list. */}
      {nextUp ? (
        <div className="flex items-center gap-3 border-b border-border bg-waiting-bg/50 px-4 py-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
            {initials(nextUp.full_name)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Up next
            </p>
            <p className="truncate text-lg font-semibold leading-tight">{nextUp.full_name}</p>
          </div>
        </div>
      ) : queue.length > 0 ? (
        <div className="border-b border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Everyone is with a client — the next check-in waits in the queue.
        </div>
      ) : null}

      <CardContent className="p-0">
        {queue.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No techs on the floor"
            description="Add technicians in Settings to start the rotation."
          />
        ) : (
          <ul className="divide-y divide-border">
            {queue.map((entry) => {
              const isNext = entry.tech_id === nextUp?.tech_id;
              const isMe = entry.tech_id === highlightTechId;

              return (
                <li
                  key={entry.tech_id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    isNext && "bg-waiting-bg/30",
                    isMe && "bg-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
                      isNext ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {entry.queue_position}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">
                        {entry.full_name}
                        {isMe ? <span className="text-muted-foreground"> (you)</span> : null}
                      </p>
                      {isNext ? <Badge variant="waiting">Up next</Badge> : null}
                      {entry.is_busy ? <Badge variant="in_progress">With a client</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      Last turn {formatRelative(entry.last_turn_at)} · {entry.jobs_today} today
                      {entry.waiting_jobs > 0 ? ` · ${entry.waiting_jobs} waiting` : ""}
                    </p>
                  </div>

                  {showResetControl ? (
                    <ActionButton
                      action={resetTurnAction}
                      fields={{ staff_id: entry.tech_id }}
                      variant="ghost"
                      size="sm"
                      confirm={`Send ${entry.full_name} to the back of the rotation?`}
                    >
                      Send to back
                    </ActionButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
