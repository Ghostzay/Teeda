import Link from "next/link";
import { CalendarClock, Coffee, Lock } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { BlockTimeDialog } from "@/components/block-time-dialog";
import { NotificationsCard } from "@/components/notifications-card";
import { ScheduleDayGrid, ScheduleWeekGrid } from "@/components/schedule-grid";
import { TechAppointments } from "@/components/tech-appointments";
import { Card, CardContent } from "@/components/ui/card";
import { unblockTime } from "@/lib/actions/schedule";
import { requireSession } from "@/lib/auth";
import { formatDate, formatTime, toDateInputValue } from "@/lib/format";
import { getActiveTechs, getNotifications, getSchedule, getTechAppointments } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { BLOCK_KIND_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The schedule.
 *
 * Managers and admins get every tech side by side in the day view; a tech sees
 * their own column. The week view is always one tech at a time — a week times
 * a full roster is unreadable on a tablet, and the question it answers is
 * "when is this person free?".
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; tech?: string }>;
}) {
  const session = await requireSession();
  const { view: rawView, date: rawDate, tech: rawTech } = await searchParams;

  const view: "day" | "week" = rawView === "week" ? "week" : "day";
  const dateStr = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : toDateInputValue();
  const [year, month, day] = dateStr.split("-").map(Number);
  const anchor = new Date(year, month - 1, day);

  const techs = session.canManageFloor
    ? await getActiveTechs()
    : [{ id: session.userId, full_name: session.profile.full_name } as const];

  const focusTechId = session.canManageFloor
    ? rawTech && techs.some((tech) => tech.id === rawTech)
      ? rawTech
      : (techs[0]?.id ?? null)
    : session.userId;

  const { open_hour: openHour, close_hour: closeHour } = session.salon;

  const [from, to] =
    view === "week"
      ? [startOfWeek(anchor), addDays(startOfWeek(anchor), 7)]
      : [new Date(year, month - 1, day), new Date(year, month - 1, day + 1)];

  // Day view for the floor shows every column; everything else is one tech.
  const scopeTech = view === "week" || !session.canManageFloor ? focusTechId : null;

  const [entries, appointments, notifications] = await Promise.all([
    getSchedule(from, to, scopeTech),
    session.isTech ? getTechAppointments(session.userId) : Promise.resolve(null),
    session.isTech ? getNotifications(8) : Promise.resolve([]),
  ]);

  const manualBlocks = entries.filter((entry) => entry.kind !== "appointment");

  const linkTo = (next: Record<string, string>) => {
    const params = new URLSearchParams({
      view,
      date: dateStr,
      ...(focusTechId && session.canManageFloor ? { tech: focusTechId } : {}),
      ...next,
    });
    return `/schedule?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {session.canManageFloor ? "Schedule" : "My schedule"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {view === "week"
              ? `Week of ${formatDate(startOfWeek(anchor).toISOString())}`
              : formatDate(anchor.toISOString())}
            {" · "}
            {entries.length} {entries.length === 1 ? "block" : "blocks"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["day", "week"] as const).map((option) => (
              <Link
                key={option}
                href={linkTo({ view: option })}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium capitalize transition-colors",
                  option === view
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </Link>
            ))}
          </div>

          <BlockTimeDialog
            techs={techs}
            defaultTechId={focusTechId ?? session.userId}
            defaultDate={dateStr}
            canPickTech={session.canManageFloor}
          />
        </div>
      </header>

      {/* Date strip — seven taps beat a date picker on a tablet. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {surroundingDays(anchor).map((entry) => (
          <Link
            key={entry.value}
            href={linkTo({ date: entry.value })}
            className={cn(
              "flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors",
              entry.value === dateStr
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-xs font-medium uppercase">{entry.weekday}</span>
            <span className="text-lg font-semibold leading-tight tabular-nums">{entry.day}</span>
          </Link>
        ))}
      </div>

      {session.canManageFloor && view === "week" && techs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {techs.map((tech) => (
            <Link
              key={tech.id}
              href={linkTo({ tech: tech.id })}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                tech.id === focusTechId
                  ? "border-transparent bg-secondary text-secondary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {tech.full_name}
            </Link>
          ))}
        </div>
      ) : null}

      <Legend />

      {view === "week" ? (
        <ScheduleWeekGrid
          weekStart={startOfWeek(anchor)}
          entries={entries}
          openHour={openHour}
          closeHour={closeHour}
        />
      ) : (
        <ScheduleDayGrid
          date={anchor}
          techs={techs}
          entries={entries}
          openHour={openHour}
          closeHour={closeHour}
          emptyLabel="No active techs on the roster yet."
        />
      )}

      {/* Blocked hours are listed as well as drawn, so they can be cleared. */}
      {manualBlocks.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Blocked hours
            </p>
            <ul className="divide-y divide-border">
              {manualBlocks.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      entry.kind === "break"
                        ? "bg-waiting-bg text-waiting"
                        : "bg-cancelled-bg text-cancelled",
                    )}
                  >
                    {entry.kind === "break" ? (
                      <Coffee className="size-4" />
                    ) : (
                      <Lock className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {entry.title ?? BLOCK_KIND_LABEL[entry.kind]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.tech_name} · {formatTime(entry.starts_at)}–{formatTime(entry.ends_at)}
                    </p>
                  </div>
                  <ActionButton
                    action={unblockTime}
                    fields={{ block_id: entry.id }}
                    variant="ghost"
                    size="sm"
                  >
                    Free up
                  </ActionButton>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {session.isTech && appointments ? (
        <>
          <NotificationsCard notifications={notifications} />
          <TechAppointments today={appointments.today} tomorrow={appointments.tomorrow} />
        </>
      ) : null}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded bg-progress" />
        <CalendarClock className="size-3" /> Appointment
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded bg-waiting" />
        <Coffee className="size-3" /> Break
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded bg-cancelled" />
        <Lock className="size-3" /> Unavailable
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded bg-progress opacity-25" />
        5-min buffer either side
      </span>
    </div>
  );
}

/** Monday-start week, matching how `date_trunc('week')` groups earnings. */
function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function surroundingDays(selected: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate() + index - 1,
    );
    return {
      value: toDateInputValue(date),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      day: date.getDate(),
    };
  });
}
