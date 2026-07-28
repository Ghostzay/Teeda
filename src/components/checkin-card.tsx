import { CalendarCheck, LogIn, LogOut } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Card, CardContent } from "@/components/ui/card";
import { checkInForTurns, checkOutOfTurns } from "@/lib/actions/rotation";
import { cn } from "@/lib/utils";

/**
 * The tech's daily opt-in.
 *
 * Nothing else on their screen matters until this is done — an unchecked tech
 * is invisible to the rotation — so it sits at the top and says so plainly.
 */
export function CheckInCard({ isCheckedIn }: { isCheckedIn: boolean }) {
  return (
    <Card
      className={cn(
        "border-2",
        isCheckedIn ? "border-[var(--status-completed)]" : "border-[var(--status-waiting)]",
      )}
    >
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            isCheckedIn ? "bg-completed-bg text-completed" : "bg-waiting-bg text-waiting",
          )}
        >
          <CalendarCheck className="size-6" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">
            {isCheckedIn ? "You're on today's rotation" : "You're not on today's rotation"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isCheckedIn
              ? "You'll be offered clients in turn order."
              : "Check in to start receiving clients today."}
          </p>
        </div>

        {isCheckedIn ? (
          <ActionButton
            action={checkOutOfTurns}
            fields={{ tech_id: null }}
            variant="outline"
            size="lg"
            confirm="Come off today's rotation? You won't be offered any more clients."
            className="[&>button]:w-full sm:[&>button]:w-auto"
          >
            <LogOut className="size-4" />
            Check out
          </ActionButton>
        ) : (
          <ActionButton
            action={checkInForTurns}
            fields={{ tech_id: null }}
            size="lg"
            className="[&>button]:h-14 [&>button]:w-full [&>button]:text-base sm:[&>button]:w-auto"
          >
            <LogIn className="size-5" />
            Check in for turns today
          </ActionButton>
        )}
      </CardContent>
    </Card>
  );
}
