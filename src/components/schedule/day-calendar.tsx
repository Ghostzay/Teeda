"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  UserCheck,
  Users,
} from "lucide-react";

import { AppointmentSheet, type SheetAppointment } from "@/components/appointment-sheet";
import { Button } from "@/components/ui/button";
import {
  HOUR_PX,
  PX_PER_MIN,
  SLOT_PX,
  layoutDay,
  minuteLabel,
  nowMinuteInSalon,
  shortName,
  type PositionedAppointment,
  type TechLane,
} from "@/lib/calendar";
import { initials } from "@/lib/format";
import type {
  AppointmentStatus,
  Customer,
  DayCalendar as DayCalendarData,
  Profile,
  ServiceMenuItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const GUTTER_PX = 60;
const COLUMN_MIN_PX = 148;

const STATUS: Record<
  AppointmentStatus,
  { label: string; icon: typeof Check; border: string; chip: string }
> = {
  scheduled: {
    label: "Booked",
    icon: CalendarClock,
    border: "border-l-info",
    chip: "bg-info-bg text-info",
  },
  checked_in: {
    label: "Checked in",
    icon: UserCheck,
    border: "border-l-warning",
    chip: "bg-warning-bg text-warning",
  },
  completed: {
    label: "Done",
    icon: Check,
    border: "border-l-success",
    chip: "bg-success-bg text-success",
  },
  cancelled: {
    label: "Cancelled",
    icon: AlertTriangle,
    border: "border-l-danger",
    chip: "bg-danger-bg text-danger",
  },
};

/**
 * One day, a column per working tech, everything drawn as a positioned block.
 *
 * The thing this replaces rendered a DOM node per 15-minute slot per tech —
 * 44 slots × 6 techs is 264 nodes before a single booking exists, and every
 * one of them re-rendered on any state change. Here the grid lines are a
 * single `repeating-linear-gradient` layer and each column is one relatively
 * positioned div, so the node count tracks the number of *things happening*
 * rather than the size of the day.
 *
 * Every number that positions anything is salon-local minutes from midnight,
 * resolved once in SQL. Nothing in this file parses a date.
 */
export function DayCalendar({
  data,
  canManageFloor,
  currentUserId,
  customers,
  techs,
  services,
}: {
  data: DayCalendarData;
  canManageFloor: boolean;
  currentUserId: string;
  customers: Pick<Customer, "id" | "name" | "phone">[];
  techs: Profile[];
  services: ServiceMenuItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<SheetAppointment | null>(null);
  // A tech opens on their own column and can widen to the floor; a manager
  // always sees everyone, so the toggle would be noise.
  const [mineOnly, setMineOnly] = useState(!canManageFloor);

  const layout = useMemo(() => layoutDay(data), [data]);

  const columns = useMemo(
    () =>
      mineOnly && !canManageFloor
        ? layout.columns.filter((column) => column.id === currentUserId)
        : layout.columns,
    [layout.columns, mineOnly, canManageFloor, currentUserId],
  );

  const showUnassigned = layout.unassigned.length > 0 && (canManageFloor || !mineOnly);
  const columnCount = columns.length + (showUnassigned ? 1 : 0);

  const nowMinute = useNowMinute(data.timezone, data.day);
  const nowTop =
    nowMinute !== null && nowMinute >= layout.openMinute && nowMinute <= layout.closeMinute
      ? (nowMinute - layout.openMinute) * PX_PER_MIN
      : null;

  /**
   * Tapping open time books into it. The booking form lives on /bookings, so
   * this hands off the tech and the minute rather than growing a second form
   * that would then need keeping in step with the first.
   */
  const book = (techId: string, minute: number) => {
    const at = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
    router.push(`/appointments?date=${data.day}&tech=${techId}&at=${at}`);
  };

  const openAppointment = (block: PositionedAppointment) => {
    const appointment = block.appointment;
    setOpen({
      id: appointment.id,
      // The sheet wants an instant; it re-reads everything else itself.
      scheduled_at: instantFor(data.day, appointment.start_min, data.timezone),
      service_name: appointment.service_name,
      service_id: null,
      status: appointment.status,
      notes: appointment.notes,
      customer_id: appointment.customer_id,
      customer_name: appointment.client_name,
      customer_phone: null,
      tech_id: appointment.tech_id,
      tech_name: layout.columns.find((c) => c.id === appointment.tech_id)?.full_name ?? null,
    });
  };

  if (layout.columns.length === 0) {
    return (
      <EmptyDay
        title="Nobody is scheduled for this day"
        body="No tech has marked themselves in, and nothing is booked. Mark days on the month view, or set a usual week."
      />
    );
  }

  if (columnCount === 0) {
    return (
      <EmptyDay
        title="You are not scheduled for this day"
        body="Switch to the whole floor to see who is in."
        action={
          <Button type="button" variant="outline" onClick={() => setMineOnly(false)}>
            <Users className="size-4" />
            Show every tech
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {!canManageFloor ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mineOnly ? "default" : "outline"}
            onClick={() => setMineOnly(true)}
          >
            My day
          </Button>
          <Button
            type="button"
            variant={mineOnly ? "outline" : "default"}
            onClick={() => setMineOnly(false)}
          >
            <Users className="size-4" />
            Everyone
          </Button>
        </div>
      ) : null}

      {data.appointments.length === 0 ? (
        <p className="rounded-xl border border-subtle bg-surface-sunken px-4 py-2.5 text-sm text-muted-text">
          Nothing booked yet — {columns.length}{" "}
          {columns.length === 1 ? "tech is" : "techs are"} in. Tap any open time to book someone.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-subtle bg-surface-raised">
        <div
          className="relative min-w-max"
          style={{ ["--col-w" as string]: `minmax(${COLUMN_MIN_PX}px, 1fr)` }}
        >
          {/* Sticky header. One row, one cell per column — not per slot. */}
          <div
            className="sticky top-0 z-30 grid border-b border-subtle bg-surface-raised"
            style={{
              gridTemplateColumns: `${GUTTER_PX}px repeat(${columnCount}, minmax(${COLUMN_MIN_PX}px, 1fr))`,
            }}
          >
            <div className="sticky left-0 z-10 bg-surface-raised" />
            {columns.map((column) => (
              <ColumnHead key={column.id} column={column} />
            ))}
            {showUnassigned ? (
              <div className="flex min-h-14 items-center gap-2 border-l border-subtle px-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning">
                  <AlertTriangle className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">Unassigned</span>
                  <span className="block text-meta text-warning">needs a tech</span>
                </span>
              </div>
            ) : null}
          </div>

          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `${GUTTER_PX}px repeat(${columnCount}, minmax(${COLUMN_MIN_PX}px, 1fr))`,
              height: layout.height,
            }}
          >
            {/* Time gutter: one node per hour, not per slot. */}
            <div className="sticky left-0 z-20 border-r border-subtle bg-surface-raised">
              {layout.hours.map((hour, index) => (
                <span
                  key={hour.minute}
                  className={cn(
                    "absolute right-2 text-meta tabular-nums text-muted-text",
                    // Centred on its line, except the first and last — half of
                    // those would sit outside the grid and get clipped.
                    index === 0
                      ? "translate-y-0.5"
                      : index === layout.hours.length - 1
                        ? "-translate-y-full"
                        : "-translate-y-1/2",
                  )}
                  style={{ top: hour.top }}
                >
                  {hour.label}
                </span>
              ))}
            </div>

            {columns.map((column) => (
              <Column
                key={column.id}
                column={column}
                openMinute={layout.openMinute}
                canBook={canManageFloor}
                onBook={book}
                onOpen={openAppointment}
              />
            ))}

            {showUnassigned ? (
              <div className="relative border-l border-subtle">
                <GridLines />
                {layout.unassigned.map((block) => (
                  <AppointmentBlock
                    key={block.appointment.id}
                    block={block}
                    warn
                    onOpen={() => openAppointment(block)}
                  />
                ))}
              </div>
            ) : null}

            {/* Now-line: one node, spanning every column, only on today. */}
            {nowTop !== null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger"
                style={{ top: nowTop, left: GUTTER_PX }}
              >
                <span className="absolute -left-1 -top-1.5 size-2.5 rounded-full bg-danger" />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <AppointmentSheet
        appointment={open}
        customers={customers}
        techs={techs}
        services={services}
        canManageFloor={canManageFloor}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function ColumnHead({ column }: { column: TechLane }) {
  return (
    <div className="flex min-h-14 items-center gap-2 border-l border-subtle px-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold",
          column.has_shift ? "bg-accent-subtle text-accent-default" : "bg-warning-bg text-warning",
        )}
      >
        {initials(column.full_name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {column.full_name.split(/\s+/)[0]}
        </span>
        {!column.has_shift ? (
          <span className="flex items-center gap-1 text-meta text-warning">
            <AlertTriangle className="size-3" />
            not on the rota
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * One tech's day.
 *
 * Three layers, and none of them is a cell grid: the gradient lines, a band
 * per shift or break, and a div per booking. A tech with an empty ten-hour day
 * costs four nodes.
 */
function Column({
  column,
  openMinute,
  canBook,
  onBook,
  onOpen,
}: {
  column: TechLane;
  openMinute: number;
  canBook: boolean;
  onBook: (techId: string, minute: number) => void;
  onOpen: (block: PositionedAppointment) => void;
}) {
  const shifts = column.bands.filter((band) => band.band.kind === "shift");

  return (
    <div className="relative border-l border-subtle">
      <GridLines />

      {/* Off-shift is the default: the column is dimmed and hatched, and the
          shift bands below light up the hours this tech is actually in.
          Painting the negative space costs one node instead of one per
          unworked slot.

          Hatched as well as dimmed because the two surfaces are only about
          0.07 apart in lightness in the light theme — enough to see side by
          side, not enough to read as "closed" on its own. */}
      <div
        aria-hidden
        className="fill-hatched absolute inset-0 bg-surface-sunken text-muted-text"
      />

      {shifts.map((band, index) => (
        <div
          key={`shift-${index}`}
          aria-hidden
          className="absolute inset-x-0 bg-surface-raised"
          style={{ top: band.top, height: band.height }}
        />
      ))}

      {/* Tappable open time, one target per shift rather than per slot. The
          minute comes from where the tap landed, snapped to a quarter hour. */}
      {canBook
        ? shifts.map((band, index) => (
            <button
              key={`book-${index}`}
              type="button"
              className="absolute inset-x-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-default"
              style={{ top: band.top, height: band.height }}
              aria-label={`Book ${column.full_name}`}
              onClick={(event) => {
                // Where the tap landed, in minutes, snapped to a quarter hour —
                // the band's own offset puts it back on the day's clock.
                const box = event.currentTarget.getBoundingClientRect();
                const minute = snap(
                  openMinute + Math.round((event.clientY - box.top + band.top) / PX_PER_MIN),
                );
                onBook(column.id, minute);
              }}
            />
          ))
        : null}

      {column.bands
        .filter((band) => band.band.kind !== "shift")
        .map((band, index) => (
          <div
            key={`off-${index}`}
            className={cn(
              "pointer-events-none absolute inset-x-0 overflow-hidden border-y border-subtle px-2 py-0.5",
              band.band.kind === "break" ? "bg-surface-overlay" : "bg-surface-sunken",
            )}
            style={{ top: band.top, height: band.height }}
          >
            <span className="flex items-center gap-1 text-meta font-medium text-muted-text">
              <Coffee className="size-3 shrink-0" />
              {band.band.kind === "break" ? "Break" : "Time off"}
              {band.band.note ? ` · ${band.band.note}` : ""}
            </span>
          </div>
        ))}

      {column.appointments.map((block) => (
        <AppointmentBlock
          key={block.appointment.id}
          block={block}
          warn={!column.has_shift}
          onOpen={() => onOpen(block)}
        />
      ))}
    </div>
  );
}

/**
 * The grid lines: one element, one gradient, zero nodes per slot.
 *
 * Quarter-hour hairlines with a stronger line on the hour. This is the single
 * change that turns the day view from O(techs × slots) into O(techs).
 */
function GridLines() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `repeating-linear-gradient(
          to bottom,
          color-mix(in oklab, var(--border-subtle) 70%, transparent) 0 1px,
          transparent 1px ${SLOT_PX}px
        ), repeating-linear-gradient(
          to bottom,
          var(--border-default) 0 1px,
          transparent 1px ${HOUR_PX}px
        )`,
      }}
    />
  );
}

function AppointmentBlock({
  block,
  warn,
  onOpen,
}: {
  block: PositionedAppointment;
  warn?: boolean;
  onOpen: () => void;
}) {
  const { appointment, lane, lanes, terse, clippedStart, clippedEnd } = block;
  const status = STATUS[appointment.status] ?? STATUS.scheduled;
  const Icon = status.icon;

  // Overlaps go side by side. The cluster sets the width, so a double-booked
  // hour does not squeeze the rest of the day.
  const width = `calc(${100 / lanes}% - 4px)`;
  const left = `calc(${(100 / lanes) * lane}% + 2px)`;

  // Lines are dropped rather than allowed to overflow: a block that spills its
  // box lies about which minutes it occupies.
  const showServices = !terse && block.height >= 52;
  const showClient = !terse;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ top: block.top, height: block.height, width, left }}
      className={cn(
        "absolute z-10 flex flex-col overflow-hidden rounded-lg border border-l-4 border-subtle bg-surface-overlay px-2 py-1 text-left transition-shadow hover:shadow-md",
        status.border,
        clippedStart && "rounded-t-none border-t-dashed",
        clippedEnd && "rounded-b-none border-b-dashed",
      )}
    >
      <span className="flex items-center gap-1 text-meta font-semibold tabular-nums leading-tight">
        <Icon className="size-3 shrink-0" />
        {minuteLabel(appointment.start_min)}
        <span className="font-normal opacity-70">{appointment.duration_min}m</span>
        {warn ? <AlertTriangle className="size-3 shrink-0 text-warning" /> : null}
      </span>

      {showClient ? (
        <span className="truncate text-sm font-medium leading-tight">
          {shortName(appointment.client_name)}
        </span>
      ) : null}

      {/* Text, not an icon. A glyph here is decoration on a line that already
          says what it is, and at 40 blocks it was ~240 SVG nodes — the single
          largest thing left in the grid after the slot buttons went. */}
      {showServices ? (
        <span className="truncate text-meta leading-tight text-muted-text">
          {appointment.services}
        </span>
      ) : null}
    </button>
  );
}

/** Header: the day, and the three ways to move off it. */
export function DayHeader({
  dateStr,
  timezone,
  query,
  techCount,
  bookingCount,
}: {
  dateStr: string;
  timezone: string;
  /**
   * The other query params to carry across a day change. A plain object, not a
   * URL builder: a function closed over server state cannot cross into a client
   * component, and passing one is a runtime error rather than a type error.
   */
  query: Record<string, string>;
  techCount: number;
  bookingCount: number;
}) {
  const linkTo = (next: Record<string, string>) =>
    `/schedule?${new URLSearchParams({ ...query, ...next }).toString()}`;

  const [year, month, day] = dateStr.split("-").map(Number);
  const anchor = new Date(year, month - 1, day);
  const today = nowMinuteInSalon(timezone, dateStr) !== null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-title">
          {anchor.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          {today ? <span className="ml-2 text-meta font-normal text-accent-default">Today</span> : null}
        </h2>
        <p className="text-meta text-muted-text">
          {techCount} {techCount === 1 ? "tech" : "techs"} in · {bookingCount}{" "}
          {bookingCount === 1 ? "booking" : "bookings"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-subtle">
          <Link
            href={linkTo({ date: shift(dateStr, -1) })}
            aria-label="Previous day"
            className="flex min-h-11 w-11 items-center justify-center bg-surface-raised text-secondary-text hover:text-primary-text"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={linkTo({ date: todayInSalon(timezone) })}
            className="flex min-h-11 items-center border-x border-subtle bg-surface-raised px-3 text-sm font-semibold text-secondary-text hover:text-primary-text"
          >
            Today
          </Link>
          <Link
            href={linkTo({ date: shift(dateStr, 1) })}
            aria-label="Next day"
            className="flex min-h-11 w-11 items-center justify-center bg-surface-raised text-secondary-text hover:text-primary-text"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <DatePicker dateStr={dateStr} linkTo={linkTo} />
      </div>
    </div>
  );
}

function DatePicker({
  dateStr,
  linkTo,
}: {
  dateStr: string;
  linkTo: (next: Record<string, string>) => string;
}) {
  const router = useRouter();
  return (
    <input
      type="date"
      value={dateStr}
      onChange={(event) => {
        if (event.target.value) router.push(linkTo({ date: event.target.value }));
      }}
      aria-label="Jump to a date"
      className="min-h-11 rounded-xl border border-subtle bg-surface-raised px-3 text-sm text-primary-text"
    />
  );
}

/** Skeleton with the real geometry, so nothing jumps when the data lands. */
export function DayCalendarSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="space-y-3">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-overlay" />
      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
        <div
          className="grid border-b border-subtle"
          style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(${columns}, 1fr)` }}
        >
          <div />
          {Array.from({ length: columns }, (_, index) => (
            <div key={index} className="flex min-h-14 items-center gap-2 border-l border-subtle px-3">
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-surface-overlay" />
              <div className="h-3 w-16 animate-pulse rounded bg-surface-overlay" />
            </div>
          ))}
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${GUTTER_PX}px repeat(${columns}, 1fr)`,
            height: 11 * HOUR_PX,
          }}
        >
          <div className="border-r border-subtle" />
          {Array.from({ length: columns }, (_, index) => (
            <div key={index} className="relative border-l border-subtle">
              <GridLines />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyDay({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-subtle bg-surface-raised px-6 py-12 text-center">
      <p className="text-title">{title}</p>
      <p className="mx-auto max-w-md text-sm text-secondary-text">{body}</p>
      {action ? <div className="flex justify-center pt-1">{action}</div> : null}
    </div>
  );
}

/** Re-reads the clock once a minute — the only ticking thing on the screen. */
function useNowMinute(timezone: string, day: string): number | null {
  const [minute, setMinute] = useState<number | null>(null);

  useEffect(() => {
    const read = () => setMinute(nowMinuteInSalon(timezone, day));
    read();
    const timer = setInterval(read, 60_000);
    return () => clearInterval(timer);
  }, [timezone, day]);

  return minute;
}

const pad = (value: number) => String(value).padStart(2, "0");
const snap = (minute: number) => Math.floor(minute / 15) * 15;

/** Shift a `YYYY-MM-DD` by whole days without touching a timezone. */
function shift(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

function todayInSalon(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * A local minute back into an instant, for the detail sheet.
 *
 * The sheet still speaks in ISO instants, so this is the one place the two
 * representations meet. It goes through the formatter rather than assuming an
 * offset, because on a DST day the offset depends on the time of day.
 */
function instantFor(day: string, minute: number, timezone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, date, Math.floor(minute / 60), minute % 60);
  // Two passes: the first offset may be the wrong side of a DST boundary.
  let instant = guess;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = guess + (instant - asUtcWallClock(instant, timezone));
  }
  return new Date(instant).toISOString();
}

/** The wall clock in `timezone`, expressed as a UTC-based epoch. */
function asUtcWallClock(instant: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}
