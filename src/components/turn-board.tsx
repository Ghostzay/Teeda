import { Clock, Crown, LogIn, LogOut } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { checkInForTurns, checkOutOfTurns } from "@/lib/actions/rotation";
import { resetTurnAction } from "@/lib/actions/salon";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SKILL_LABEL, type TurnQueueEntry } from "@/lib/types";

/**
 * The rotation board — the most prominent thing on every screen that shows it.
 *
 * Only techs checked in for today hold a queue position; everyone else is
 * listed below, greyed, so the desk can see who's missing and check them in.
 * `last_turn_at` is on every row so the order is auditable by anyone standing
 * at the desk — the point is that nobody has to take it on faith.
 */
export function TurnBoard({
  queue,
  highlightTechId,
  showFloorControls = false,
}: {
  queue: TurnQueueEntry[];
  highlightTechId?: string;
  /** Reset-turn and check-in/out controls — front desk only. */
  showFloorControls?: boolean;
}) {
  const onRotation = queue.filter((entry) => entry.is_checked_in);
  const offRotation = queue.filter((entry) => !entry.is_checked_in);
  const nextUp = onRotation.find((entry) => !entry.is_busy);

  return (
    <Card className="border-2 border-primary/25 shadow-md">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border bg-primary/5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Crown className="size-5 text-primary" />
          Turn rotation
        </CardTitle>
        <span className="text-xs font-medium text-muted-foreground">
          {onRotation.length} checked in today
        </span>
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
      ) : onRotation.length > 0 ? (
        <div className="border-b border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Everyone on rotation is with a client — the next check-in waits in the queue.
        </div>
      ) : null}

      <CardContent className="p-0">
        {queue.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No techs on the roster"
            description="Add technicians in Settings to start the rotation."
          />
        ) : onRotation.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nobody has checked in for turns today.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {onRotation.map((entry) => (
              <TechRow
                key={entry.tech_id}
                entry={entry}
                isNext={entry.tech_id === nextUp?.tech_id}
                isMe={entry.tech_id === highlightTechId}
                showFloorControls={showFloorControls}
              />
            ))}
          </ul>
        )}

        {offRotation.length > 0 ? (
          <div className="border-t border-border">
            <p className="bg-muted px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Not checked in today
            </p>
            <ul className="divide-y divide-border">
              {offRotation.map((entry) => (
                <TechRow
                  key={entry.tech_id}
                  entry={entry}
                  isNext={false}
                  isMe={entry.tech_id === highlightTechId}
                  showFloorControls={showFloorControls}
                  muted
                />
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TechRow({
  entry,
  isNext,
  isMe,
  showFloorControls,
  muted = false,
}: {
  entry: TurnQueueEntry;
  isNext: boolean;
  isMe: boolean;
  showFloorControls: boolean;
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        isNext && "bg-waiting-bg/30",
        isMe && "bg-accent/60",
        muted && "opacity-70",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
          isNext ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {entry.queue_position ?? "–"}
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

        {entry.skills.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground">
            {entry.skills.map((skill) => SKILL_LABEL[skill]).join(" · ")}
          </p>
        ) : (
          <p className="truncate text-xs text-waiting">No services set — can only take any-skill work</p>
        )}
      </div>

      {showFloorControls ? (
        <div className="flex shrink-0 items-center gap-1">
          {entry.is_checked_in ? (
            <>
              <ActionButton
                action={resetTurnAction}
                fields={{ staff_id: entry.tech_id }}
                variant="ghost"
                size="sm"
                confirm={`Send ${entry.full_name} to the back of the rotation?`}
              >
                Send to back
              </ActionButton>
              <ActionButton
                action={checkOutOfTurns}
                fields={{ tech_id: entry.tech_id }}
                variant="ghost"
                size="icon"
                confirm={`Take ${entry.full_name} off today's rotation?`}
              >
                <LogOut className="size-4" />
                <span className="sr-only">Check {entry.full_name} out</span>
              </ActionButton>
            </>
          ) : (
            <ActionButton
              action={checkInForTurns}
              fields={{ tech_id: entry.tech_id }}
              variant="outline"
              size="sm"
            >
              <LogIn className="size-4" />
              Check in
            </ActionButton>
          )}
        </div>
      ) : null}
    </li>
  );
}
