import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarDays, Footprints, UserCheck } from "lucide-react";

import { CalendarNudge } from "@/components/schedule/calendar-nudge";
import { MonthNavigator } from "@/components/schedule/month-navigator";
import { UsualWeek } from "@/components/schedule/usual-week";
import { DayBoard } from "@/components/schedule/day-board";
import { ScheduleBoardSkeleton } from "@/components/schedule/schedule-board";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate, toDateInputValue } from "@/lib/format";
import {
  getActiveTechs,
  getAvailabilityPatterns,
  getCustomerOptions,
  getMonthAvailability,
  getScheduleOverlay,
  getServiceMenu,
  getUnmarkedTechs,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type View = "month" | "day" | "mine";

/**
 * Staff hours.
 *
 * Not a timesheet — nothing here records hours worked. It answers two
 * questions: which days is each tech planning to be in, and what is already on
 * the books for a given day. Hence three views:
 *
 *   month  who is in, across the month. Techs mark their own days here.
 *   day    one day, a column per tech — the floor view.
 *   mine   one tech, three days across — reads on a phone, and it is the view
 *          a tech actually wants for their own week.
 *
 * Appointments and walk-ins appear on their own. Nobody types them in twice.
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

  const requested = params.view;
  const view: View =
    requested === "day" || requested === "mine" || requested === "month"
      ? requested
      : // A manager opens on the month; a tech opens on their own days.
        session.canManageFloor
        ? "month"
        : "mine";

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
      : (techs[0]?.id ?? session.userId)
    : session.userId;

  const openHour = session.salon.open_hour ?? 9;
  const closeHour = session.salon.close_hour ?? 20;

  const linkTo = (next: Record<string, string>) => {
    const query = new URLSearchParams({
      view,
      date: dateStr,
      ...(session.canManageFloor ? { tech: focusTechId } : {}),
      ...next,
    });
    return `/schedule?${query.toString()}`;
  };

  // ---- Month --------------------------------------------------------------
  if (view === "month") {
    const first = new Date(year, month - 1, 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + 42);

    const [{ days, error }, patterns, unmarked] = await Promise.all([
      getMonthAvailability(toDateInputValue(gridStart), toDateInputValue(gridEnd)),
      getAvailabilityPatterns(),
      getUnmarkedTechs(7),
    ]);

    const marked = new Set(days.filter((entry) => entry.kind === "shift").map((e) => e.tech_id));

    return (
      <div className="space-y-5">
        <Header
          view={view}
          canManageFloor={session.canManageFloor}
          linkTo={linkTo}
          subtitle={`${anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })} · ${marked.size} of ${techs.length} ${techs.length === 1 ? "tech has" : "techs have"} days marked`}
        />
        <CalendarNudge
          techs={unmarked}
          self={session.canManageFloor ? undefined : { id: session.userId }}
        />

        <UsualWeek
          patterns={patterns}
          techs={techs}
          currentUserId={session.userId}
          canManageFloor={session.canManageFloor}
        />

        {error ? (
          <ScheduleError message={error} />
        ) : (
          <MonthNavigator
            dateStr={dateStr}
            days={days}
            techs={techs}
            currentUserId={session.userId}
            canManageFloor={session.canManageFloor}
          />
        )}
        <p className="text-meta text-muted-text">
          Tap a day to mark yourself in, or to open it hour by hour · Chạm vào ngày để đánh dấu
        </p>
      </div>
    );
  }

  // ---- Day (every tech) and Mine (one tech, three days) --------------------
  const span = view === "mine" ? 3 : 1;
  const from = new Date(year, month - 1, day);
  const to = new Date(year, month - 1, day + span);

  const scopeTech = view === "mine" || !session.canManageFloor ? focusTechId : null;
  const [{ items, error }, customers, services] = await Promise.all([
    getScheduleOverlay(from, to, scopeTech),
    session.canManageFloor ? getCustomerOptions() : Promise.resolve([]),
    session.canManageFloor ? getServiceMenu() : Promise.resolve([]),
  ]);

  const spanDays =
    view === "mine"
      ? Array.from({ length: span }, (_, i) => {
          const d = new Date(year, month - 1, day + i);
          return {
            value: toDateInputValue(d),
            label: `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`,
            date: d,
          };
        })
      : undefined;

  const focusName = techs.find((tech) => tech.id === focusTechId)?.full_name ?? "";

  return (
    <div className="space-y-5">
      <Header
        view={view}
        canManageFloor={session.canManageFloor}
        linkTo={linkTo}
        subtitle={
          view === "mine"
            ? `${focusName} · from ${formatDate(from.toISOString())} · ${items.length} ${items.length === 1 ? "entry" : "entries"}`
            : `${formatDate(anchor.toISOString())} · ${items.length} ${items.length === 1 ? "entry" : "entries"}`
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {surroundingDays(anchor).map((entry) => (
          <Link
            key={entry.value}
            href={linkTo({ date: entry.value })}
            className={cn(
              "flex min-h-[3.25rem] min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-xl border px-3 transition-colors",
              entry.value === dateStr
                ? "border-transparent bg-accent-default text-on-accent"
                : "border-subtle bg-surface-raised text-secondary-text hover:bg-surface-overlay",
            )}
          >
            <span className="text-meta font-semibold uppercase">{entry.weekday}</span>
            <span className="text-base font-semibold leading-tight tabular-nums">{entry.day}</span>
          </Link>
        ))}
      </div>

      {/* Only the personal view is one tech at a time, so only it needs a picker. */}
      {session.canManageFloor && view === "mine" && techs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {techs.map((tech) => (
            <Link
              key={tech.id}
              href={linkTo({ tech: tech.id })}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                tech.id === focusTechId
                  ? "border-transparent bg-surface-overlay text-primary-text"
                  : "border-subtle bg-surface-raised text-secondary-text hover:bg-surface-overlay",
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
        <DayBoard
          // "mine" reuses the week board: one tech, columns of days.
          view={view === "mine" ? "week" : "day"}
          date={anchor}
          dateStr={dateStr}
          techs={view === "mine" ? techs.filter((tech) => tech.id === focusTechId) : techs}
          items={items}
          openHour={openHour}
          closeHour={closeHour}
          currentUserId={session.userId}
          canManageFloor={session.canManageFloor}
          weekDays={spanDays}
          customers={customers}
          fullTechs={allTechs}
          services={services}
        />
      )}

      <p className="text-meta text-muted-text">
        Tap an empty slot to add hours · Chạm vào ô trống để thêm giờ
      </p>
    </div>
  );
}

const VIEW_META: Record<View, { label: string; icon: typeof CalendarDays }> = {
  month: { label: "Month", icon: CalendarDays },
  day: { label: "Day", icon: CalendarClock },
  mine: { label: "3 days", icon: UserCheck },
};

function Header({
  view,
  subtitle,
  linkTo,
  canManageFloor,
}: {
  view: View;
  subtitle: string;
  linkTo: (next: Record<string, string>) => string;
  canManageFloor: boolean;
}) {
  // A tech has no floor view to look at — every column would be their own.
  const views: View[] = canManageFloor ? ["month", "day", "mine"] : ["month", "mine"];

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-display">{canManageFloor ? "Staff hours" : "My hours"}</h1>
        <p className="mt-1 text-sm text-secondary-text">
          {subtitle}
          <span className="ml-2 opacity-70">Giờ làm việc</span>
        </p>
      </div>

      <div className="flex overflow-hidden rounded-xl border border-subtle">
        {views.map((option) => {
          const meta = VIEW_META[option];
          const Icon = meta.icon;
          return (
            <Link
              key={option}
              href={linkTo({ view: option })}
              className={cn(
                "flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                option === view
                  ? "bg-accent-default text-on-accent"
                  : "bg-surface-raised text-secondary-text hover:text-primary-text",
              )}
            >
              <Icon className="size-4" />
              {meta.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

function Legend() {
  const items = [
    {
      icon: UserCheck,
      label: "Working",
      vi: "Đang làm",
      cls: "bg-accent-subtle border-accent-default/50",
      hatch: false,
    },
    {
      icon: CalendarClock,
      label: "Appointment",
      vi: "Lịch hẹn",
      cls: "bg-info-bg border-info-border text-info",
      hatch: true,
    },
    {
      icon: Footprints,
      label: "Walk-in",
      vi: "Khách vãng lai",
      cls: "bg-warning-bg border-warning-border text-warning",
      hatch: true,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map(({ icon: Icon, label, vi, cls, hatch }) => (
        <span key={label} className="inline-flex items-center gap-2 text-meta text-muted-text">
          <span className={cn("size-4 rounded border", cls, hatch && "fill-hatched")} />
          <Icon className="size-3.5" />
          {label} <span className="opacity-70">· {vi}</span>
        </span>
      ))}
      <span className="text-meta text-muted-text">
        Bookings and walk-ins appear on their own · Lịch hẹn tự hiện lên
      </span>
    </div>
  );
}

function ScheduleError({ message }: { message: string }) {
  return (
    <Card className="border-danger-border">
      <CardContent className="flex items-start gap-4 p-6">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger">
          <AlertTriangle className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-title">This screen couldn&apos;t load</p>
          <p className="text-sm text-secondary-text">{message}</p>
          <p className="text-sm text-muted-text">Không tải được — xem thông báo phía trên.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SchedulePending() {
  return (
    <div className="space-y-5">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-surface-overlay" />
      <div className="h-14 w-full animate-pulse rounded-xl bg-surface-overlay" />
      <ScheduleBoardSkeleton />
    </div>
  );
}

/** Five days either side, so a week is reachable without a date picker. */
function surroundingDays(selected: Date) {
  return Array.from({ length: 11 }, (_, index) => {
    const date = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate() + index - 5,
    );
    return {
      value: toDateInputValue(date),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      day: date.getDate(),
    };
  });
}
