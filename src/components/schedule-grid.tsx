import { CalendarClock, Coffee, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BlockKind, Profile, ScheduleEntry } from "@/lib/types";

/** Pixels per minute. 1.1 gives a 45-minute service a comfortable 50px card. */
const PX_PER_MIN = 1.1;

/** Breathing room so the first hour label isn't clipped by the header. */
const TOP_PAD = 10;

const KIND_STYLE: Record<BlockKind, { block: string; rail: string; icon: typeof CalendarClock }> = {
  appointment: {
    block: "bg-progress-bg text-progress border-progress/30",
    rail: "bg-progress",
    icon: CalendarClock,
  },
  break: {
    block: "bg-waiting-bg text-waiting border-waiting/30",
    rail: "bg-waiting",
    icon: Coffee,
  },
  unavailable: {
    block: "bg-cancelled-bg text-cancelled border-cancelled/30",
    rail: "bg-cancelled",
    icon: Lock,
  },
};

function minutesFrom(dayStart: Date, iso: string) {
  return (Date.parse(iso) - dayStart.getTime()) / 60_000;
}

/**
 * The day view: one column per tech, hours down the side.
 *
 * Blocks are absolutely positioned by minute offset, and the 5-minute buffer
 * is drawn as a faint extension of the card — so a slot that *looks* free
 * really is free, padding included.
 */
export function ScheduleDayGrid({
  date,
  techs,
  entries,
  openHour,
  closeHour,
  emptyLabel = "Nobody on the roster.",
}: {
  date: Date;
  techs: Pick<Profile, "id" | "full_name">[];
  entries: ScheduleEntry[];
  openHour: number;
  closeHour: number;
  emptyLabel?: string;
}) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), openHour);
  const totalMinutes = (closeHour - openHour) * 60;
  const height = totalMinutes * PX_PER_MIN + TOP_PAD * 2;
  const hours = Array.from({ length: closeHour - openHour + 1 }, (_, i) => openHour + i);

  const now = new Date();
  const showNow =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate() &&
    now.getHours() >= openHour &&
    now.getHours() < closeHour;
  const nowOffset = showNow ? minutesFrom(dayStart, now.toISOString()) * PX_PER_MIN : 0;

  if (techs.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">{emptyLabel}</Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="w-full min-w-max">
          {/* Column headers stay put while the grid scrolls under them. */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-card">
            <div className="w-14 shrink-0 border-r border-border" />
            {techs.map((tech) => (
              <div
                key={tech.id}
                className="min-w-40 flex-1 border-r border-border px-2 py-2 text-center last:border-r-0"
              >
                <p className="truncate text-sm font-semibold">{tech.full_name}</p>
              </div>
            ))}
          </div>

          <div className="relative flex" style={{ height }}>
            {/* Hour rail */}
            <div className="relative w-14 shrink-0 border-r border-border">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                  style={{ top: TOP_PAD + (hour - openHour) * 60 * PX_PER_MIN }}
                >
                  {formatHour(hour)}
                </div>
              ))}
            </div>

            {/* Hour lines behind every column */}
            <div className="pointer-events-none absolute inset-y-0 left-14 right-0">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-border/70"
                  style={{ top: TOP_PAD + (hour - openHour) * 60 * PX_PER_MIN }}
                />
              ))}
            </div>

            {techs.map((tech) => {
              const blocks = entries.filter((entry) => entry.tech_id === tech.id);

              return (
                <div
                  key={tech.id}
                  className="relative min-w-40 flex-1 border-r border-border last:border-r-0"
                >
                  {blocks.map((entry) => {
                    const style = KIND_STYLE[entry.kind];
                    const Icon = style.icon;

                    const top = minutesFrom(dayStart, entry.starts_at) * PX_PER_MIN;
                    const blockHeight =
                      ((Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) / 60_000) *
                      PX_PER_MIN;
                    const bufferTop = minutesFrom(dayStart, entry.blocked_from) * PX_PER_MIN;
                    const bufferHeight =
                      ((Date.parse(entry.blocked_to) - Date.parse(entry.blocked_from)) / 60_000) *
                      PX_PER_MIN;

                    return (
                      <div key={entry.id}>
                        {/* Buffer shadow — the slot isn't bookable either. */}
                        <div
                          className={cn("absolute inset-x-1 rounded-md opacity-25", style.rail)}
                          style={{ top: TOP_PAD + bufferTop, height: bufferHeight }}
                          aria-hidden
                        />
                        <div
                          className={cn(
                            "absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1",
                            style.block,
                          )}
                          style={{ top: TOP_PAD + top, height: Math.max(blockHeight, 22) }}
                        >
                          <p className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
                            <Icon className="size-3 shrink-0" />
                            {formatTime(entry.starts_at)}
                          </p>
                          {blockHeight > 34 ? (
                            <p className="truncate text-[11px] leading-tight opacity-90">
                              {entry.title ?? kindLabel(entry.kind)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {showNow ? (
              <div
                className="pointer-events-none absolute left-14 right-0 z-10 border-t-2 border-primary"
                style={{ top: TOP_PAD + nowOffset }}
              >
                <span className="absolute -top-2 left-0 size-3 rounded-full bg-primary" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * The week view: seven day columns for a single tech.
 *
 * One tech at a time on purpose — a week times a full roster is unreadable on
 * a tablet, and the question a week view answers is "when is *this person*
 * free?".
 */
export function ScheduleWeekGrid({
  weekStart,
  entries,
  openHour,
  closeHour,
}: {
  weekStart: Date;
  entries: ScheduleEntry[];
  openHour: number;
  closeHour: number;
}) {
  const totalMinutes = (closeHour - openHour) * 60;
  const height = totalMinutes * PX_PER_MIN + TOP_PAD * 2;
  const hours = Array.from({ length: closeHour - openHour + 1 }, (_, i) => openHour + i);

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    return day;
  });

  const today = new Date();

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="w-full min-w-max">
          <div className="sticky top-0 z-20 flex border-b border-border bg-card">
            <div className="w-14 shrink-0 border-r border-border" />
            {days.map((day) => {
              const isToday = day.toDateString() === today.toDateString();
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-w-24 flex-1 border-r border-border px-1 py-2 text-center last:border-r-0",
                    isToday && "bg-accent",
                  )}
                >
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p className={cn("text-lg font-semibold tabular-nums", isToday && "text-primary")}>
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height }}>
            <div className="relative w-14 shrink-0 border-r border-border">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                  style={{ top: TOP_PAD + (hour - openHour) * 60 * PX_PER_MIN }}
                >
                  {formatHour(hour)}
                </div>
              ))}
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-14 right-0">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-border/70"
                  style={{ top: TOP_PAD + (hour - openHour) * 60 * PX_PER_MIN }}
                />
              ))}
            </div>

            {days.map((day) => {
              const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), openHour);
              const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), closeHour);
              const dayBlocks = entries.filter((entry) => {
                const start = Date.parse(entry.starts_at);
                return start >= dayStart.getTime() - 12 * 3600_000 && start < dayEnd.getTime();
              });

              return (
                <div
                  key={day.toISOString()}
                  className="relative min-w-24 flex-1 border-r border-border last:border-r-0"
                >
                  {dayBlocks.map((entry) => {
                    const style = KIND_STYLE[entry.kind];
                    const top = minutesFrom(dayStart, entry.starts_at) * PX_PER_MIN;
                    const blockHeight =
                      ((Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) / 60_000) *
                      PX_PER_MIN;

                    if (top < -20 || top > height) return null;

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "absolute inset-x-0.5 overflow-hidden rounded-md border px-1 py-0.5",
                          style.block,
                        )}
                        style={{ top: TOP_PAD + top, height: Math.max(blockHeight, 20) }}
                        title={entry.title ?? kindLabel(entry.kind)}
                      >
                        <p className="truncate text-[10px] font-semibold leading-tight">
                          {formatTime(entry.starts_at)}
                        </p>
                        {blockHeight > 30 ? (
                          <p className="truncate text-[10px] leading-tight opacity-90">
                            {entry.title ?? kindLabel(entry.kind)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "p" : "a";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

function kindLabel(kind: BlockKind): string {
  return kind === "appointment" ? "Appointment" : kind === "break" ? "Break" : "Unavailable";
}
