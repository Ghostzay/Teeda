import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Footprints, UserCheck } from "lucide-react";

import { ScheduleBoard, ScheduleBoardSkeleton } from "@/components/schedule/schedule-board";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate, toDateInputValue } from "@/lib/format";
import { getActiveTechs, getScheduleOverlay } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The schedule.
 *
 * Day view is the default because that is the question a tablet on the counter
 * is asked all day. Managers and admins see every tech as a column; a tech
 * sees their own. Week view is one tech across seven days.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; tech?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<SchedulePending />}>
      <ScheduleContent params={params} />
    </Suspense>
  );
}

async function ScheduleContent({
  params,
}: {
  params: { view?: string; date?: string; tech?: string };
}) {
  const session = await requireSession();

  const view: "day" | "week" = params.view === "week" ? "week" : "day";
  const dateStr =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : toDateInputValue();
  const [year, month, day] = dateStr.split("-").map(Number);
  const anchor = new Date(year, month - 1, day);

  const allTechs = await getActiveTechs();
  const techs = session.canManageFloor
    ? allTechs.map((tech) => ({ id: tech.id, full_name: tech.full_name }))
    : [{ id: session.userId, full_name: session.profile.full_name }];

  const focusTechId = session.canManageFloor
    ? params.tech && techs.some((tech) => tech.id === params.tech)
      ? params.tech
      : (techs[0]?.id ?? null)
    : session.userId;

  const openHour = session.salon.open_hour ?? 9;
  const closeHour = session.salon.close_hour ?? 20;

  const weekStart = startOfWeek(anchor);
  const [from, to] =
    view === "week"
      ? [weekStart, addDays(weekStart, 7)]
      : [new Date(year, month - 1, day), new Date(year, month - 1, day + 1)];

  // Week view is one tech across days; day view for the floor is all techs.
  const scopeTech = view === "week" || !session.canManageFloor ? focusTechId : null;
  const { items, error } = await getScheduleOverlay(from, to, scopeTech);

  const weekDays =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          return {
            value: toDateInputValue(d),
            label: `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`,
            date: d,
          };
        })
      : undefined;

  const linkTo = (next: Record<string, string>) => {
    const query = new URLSearchParams({
      view,
      date: dateStr,
      ...(focusTechId && session.canManageFloor ? { tech: focusTechId } : {}),
      ...next,
    });
    return `/schedule?${query.toString()}`;
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display">
            {session.canManageFloor ? "Schedule" : "My schedule"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "week"
              ? `Week of ${formatDate(weekStart.toISOString())}`
              : formatDate(anchor.toISOString())}
            {" · "}
            {items.length} {items.length === 1 ? "entry" : "entries"}
            <span className="ml-2 opacity-70">Lịch làm việc</span>
          </p>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-border">
          {(["day", "week"] as const).map((option) => (
            <Link
              key={option}
              href={linkTo({ view: option })}
              className={cn(
                "min-h-11 px-5 py-2.5 text-sm font-semibold capitalize transition-colors",
                option === view
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </Link>
          ))}
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {surroundingDays(anchor).map((entry) => (
          <Link
            key={entry.value}
            href={linkTo({ date: entry.value })}
            className={cn(
              "flex min-h-[3.25rem] min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-xl border px-3 transition-colors",
              entry.value === dateStr
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-meta font-semibold uppercase">{entry.weekday}</span>
            <span className="text-base font-semibold leading-tight tabular-nums">{entry.day}</span>
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

      {error ? (
        <ScheduleError message={error} />
      ) : (
        <ScheduleBoard
          view={view}
          date={anchor}
          dateStr={dateStr}
          techs={techs}
          items={items}
          openHour={openHour}
          closeHour={closeHour}
          currentUserId={session.userId}
          canManageFloor={session.canManageFloor}
          weekDays={weekDays}
        />
      )}

      <p className="text-meta text-muted-foreground">
        Tap an empty slot to add a shift · Chạm vào ô trống để thêm ca làm
      </p>
    </div>
  );
}

function Legend() {
  const items = [
    { icon: UserCheck, label: "Shift", vi: "Ca làm", cls: "bg-accent-subtle border-accent-default/50", hatch: false },
    { icon: CalendarClock, label: "Appointment", vi: "Lịch hẹn", cls: "bg-info-bg border-info-border text-info", hatch: true },
    { icon: Footprints, label: "Walk-in", vi: "Khách vãng lai", cls: "bg-warning-bg border-warning-border text-warning", hatch: true },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map(({ icon: Icon, label, vi, cls, hatch }) => (
        <span key={label} className="inline-flex items-center gap-2 text-meta text-muted-foreground">
          <span className={cn("size-4 rounded border", cls, hatch && "fill-hatched")} />
          <Icon className="size-3.5" />
          {label} <span className="opacity-70">· {vi}</span>
        </span>
      ))}
      <span className="text-meta text-muted-foreground">
        Read-only layers are hatched · Lớp chỉ đọc có gạch chéo
      </span>
    </div>
  );
}

function ScheduleError({ message }: { message: string }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex items-start gap-4 p-6">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-title">The schedule couldn&apos;t load</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="text-sm text-muted-foreground">
            Không tải được lịch làm việc — xem thông báo phía trên.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SchedulePending() {
  return (
    <div className="space-y-5">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-14 w-full animate-pulse rounded-xl bg-surface-2" />
      <ScheduleBoardSkeleton />
    </div>
  );
}

/** Monday-start week, matching how earnings group by week. */
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
    const date = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + index - 1);
    return {
      value: toDateInputValue(date),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      day: date.getDate(),
    };
  });
}
