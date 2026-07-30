import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarDays } from "lucide-react";

import { CalendarNudge } from "@/components/schedule/calendar-nudge";
import { DayCalendar, DayCalendarSkeleton, DayHeader } from "@/components/schedule/day-calendar";
import { MonthNavigator } from "@/components/schedule/month-navigator";
import { UsualWeek } from "@/components/schedule/usual-week";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate, toDateInputValue } from "@/lib/format";
import {
  getActiveTechs,
  getAvailabilityPatterns,
  getDayCalendar,
  getMonthAvailability,
  getServiceMenu,
  getUnmarkedTechs,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type View = "month" | "day";

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
    requested === "day" || requested === "month"
      ? requested
      : // A manager opens on the month to see the shape of the week; a tech
        // opens on the day, because their own next client is the question.
        session.canManageFloor
        ? "month"
        : "day";

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

  // ---- Day: one day, a column per working tech -----------------------------
  //
  // The floor view. Everything it needs comes back in one call with every time
  // already resolved to salon-local minutes, so nothing below parses a date.
  if (view === "day") {
    const [{ data, error }, services] = await Promise.all([
      getDayCalendar(dateStr, session.canManageFloor ? null : session.userId),
      session.canManageFloor ? getServiceMenu() : Promise.resolve([]),
    ]);

    return (
      <div className="space-y-5">
        <Header
          view={view}
          canManageFloor={session.canManageFloor}
          linkTo={linkTo}
          subtitle={formatDate(anchor.toISOString())}
        />

        {error || !data ? (
          <ScheduleError message={error ?? "The day wouldn't load."} />
        ) : (
          <>
            <DayHeader
              dateStr={dateStr}
              timezone={data.timezone}
              query={{
                view: "day",
                ...(session.canManageFloor ? { tech: focusTechId } : {}),
              }}
              techCount={data.techs.length}
              bookingCount={data.appointments.length}
            />
            <DayCalendar
              data={data}
              canManageFloor={session.canManageFloor}
              currentUserId={session.userId}
              techs={allTechs}
              services={services}
            />
          </>
        )}

        <p className="text-meta text-muted-text">
          Tap a booking to open it · Tap open time to book · Chạm để mở
        </p>
      </div>
    );
  }

}

const VIEW_META: Record<View, { label: string; icon: typeof CalendarDays }> = {
  month: { label: "Month", icon: CalendarDays },
  day: { label: "Day", icon: CalendarClock },
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
  // Both roles get both views. The day view scopes itself: a tech opens on
  // their own column and can widen to the floor from inside it.
  const views: View[] = ["month", "day"];

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
      <DayCalendarSkeleton />
    </div>
  );
}
