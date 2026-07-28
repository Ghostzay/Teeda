import Link from "next/link";
import { ArrowRight, CalendarPlus } from "lucide-react";

import type { UnmarkedTech } from "@/lib/types";

/**
 * "You have no days marked next week."
 *
 * The month view is only worth having if it gets filled in, and a calendar
 * nobody fills in is worse than none — the floor checks it twice, finds it
 * empty, and stops looking. So the prompt goes where the person who can fix it
 * already is, rather than waiting for them to visit the calendar.
 *
 * Two audiences, one component: a tech is told about themselves, the front desk
 * is told who is missing.
 */
export function CalendarNudge({
  techs,
  days = 7,
  self,
}: {
  techs: UnmarkedTech[];
  days?: number;
  /** When set, this is a tech looking at their own screen. */
  self?: { id: string };
}) {
  const mine = self ? techs.find((tech) => tech.tech_id === self.id) : undefined;

  if (self && !mine) return null;
  if (!self && techs.length === 0) return null;

  const window = days === 7 ? "the next 7 days" : `the next ${days} days`;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning-border bg-warning-bg px-4 py-3 text-warning">
      <CalendarPlus className="size-5 shrink-0" />

      <div className="min-w-0 flex-1">
        {self ? (
          <>
            <p className="font-semibold leading-tight">
              You have no days marked for {window}
            </p>
            <p className="text-sm opacity-90">
              {mine?.has_pattern
                ? "Your usual week doesn't cover these days — add them so the desk knows you're in."
                : "Set your usual week once and it fills itself in from now on."}
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold leading-tight">
              {techs.length === 1
                ? `${techs[0].full_name} has no days marked for ${window}`
                : `${techs.length} techs have no days marked for ${window}`}
            </p>
            {/* With one tech the headline already names them; repeating it
                just makes the banner taller. */}
            {techs.length > 1 ? (
              <p className="truncate text-sm opacity-90">
                {techs.map((tech) => tech.full_name).join(", ")}
              </p>
            ) : (
              <p className="text-sm opacity-90">
                {techs[0].has_pattern
                  ? "Their usual week doesn't cover these days."
                  : "They haven't set a usual week yet."}
              </p>
            )}
          </>
        )}
      </div>

      <Link
        href="/schedule?view=month"
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-warning-border px-4 text-sm font-semibold transition-colors hover:bg-surface-overlay"
      >
        {self ? "Mark my days" : "Open the calendar"}
        <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}
