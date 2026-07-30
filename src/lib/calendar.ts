import type { CalendarBand, DayCalendar, CalendarAppointment } from "@/lib/types";

/**
 * Pixels per minute. The single source of truth for the day grid's scale —
 * 1.6 px/min puts a 15-minute slot at 24px and an hour at 96px.
 *
 * Everything that positions anything reads this constant. Nothing hard-codes a
 * slot height, because the moment two places disagree the grid lines stop
 * lining up with the blocks and the whole screen quietly lies.
 */
export const PX_PER_MIN = 1.6;

export const SLOT_MINUTES = 15;
export const SLOT_PX = SLOT_MINUTES * PX_PER_MIN; // 24
export const HOUR_PX = 60 * PX_PER_MIN; // 96

/** Blocks shorter than this only have room for a time. */
export const TERSE_BLOCK_MINUTES = 30;

/** A block, resolved to its box. All numbers are pixels from the grid top. */
export type PositionedAppointment = {
  appointment: CalendarAppointment;
  top: number;
  height: number;
  /** 0-based lane within its overlap cluster, and how many lanes that needs. */
  lane: number;
  lanes: number;
  /** True when the booking starts before open — the block is cut at the top. */
  clippedStart: boolean;
  /** True when it runs past close — cut at the bottom. */
  clippedEnd: boolean;
  /** Too short to fit anything but a time. */
  terse: boolean;
};

export type PositionedBand = {
  band: CalendarBand;
  top: number;
  height: number;
};

export type TechLane = {
  id: string;
  full_name: string;
  /** False when they have bookings but nothing on the rota — warning badge. */
  has_shift: boolean;
  bands: PositionedBand[];
  appointments: PositionedAppointment[];
};

export type DayLayout = {
  openMinute: number;
  closeMinute: number;
  /** Total grid height in pixels. */
  height: number;
  /** Hour marks, for the left gutter. */
  hours: { minute: number; top: number; label: string }[];
  columns: TechLane[];
  /** Bookings with nobody assigned, given their own column when non-empty. */
  unassigned: PositionedAppointment[];
};

/**
 * Where each block sits, given a day's worth of data.
 *
 * Pure: same input, same output, no clock, no DOM, no timezone. Every minute
 * value arriving here is already salon-local minutes-from-midnight — resolved
 * once in `day_calendar()` — so this is integer arithmetic and nothing else.
 * That is deliberate: date maths sprinkled through a render is how a calendar
 * ends up an hour out twice a year.
 */
export function layoutDay(data: DayCalendar): DayLayout {
  const openMinute = data.open_minute;
  const closeMinute = Math.max(data.close_minute, openMinute + 60);
  const span = closeMinute - openMinute;

  const hours: DayLayout["hours"] = [];
  for (let minute = openMinute; minute <= closeMinute; minute += 60) {
    hours.push({
      minute,
      top: (minute - openMinute) * PX_PER_MIN,
      label: hourLabel(minute),
    });
  }

  const byTech = new Map<string, CalendarAppointment[]>();
  const unassignedRaw: CalendarAppointment[] = [];
  for (const appointment of data.appointments) {
    if (!appointment.tech_id) {
      unassignedRaw.push(appointment);
      continue;
    }
    const list = byTech.get(appointment.tech_id);
    if (list) list.push(appointment);
    else byTech.set(appointment.tech_id, [appointment]);
  }

  const bandsByTech = new Map<string, CalendarBand[]>();
  for (const band of data.bands) {
    const list = bandsByTech.get(band.tech_id);
    if (list) list.push(band);
    else bandsByTech.set(band.tech_id, [band]);
  }

  const columns = data.techs.map((tech) => ({
    id: tech.id,
    full_name: tech.full_name,
    has_shift: tech.has_shift,
    bands: (bandsByTech.get(tech.id) ?? [])
      .map((band) => positionBand(band, openMinute, closeMinute))
      .filter((positioned): positioned is PositionedBand => positioned !== null),
    appointments: position(byTech.get(tech.id) ?? [], openMinute, closeMinute),
  }));

  return {
    openMinute,
    closeMinute,
    height: span * PX_PER_MIN,
    hours,
    columns,
    unassigned: position(unassignedRaw, openMinute, closeMinute),
  };
}

/**
 * Clamp a band to the grid. Returns null when it misses the open day entirely,
 * which is how an overnight time-off block stops drawing a zero-height sliver.
 */
function positionBand(
  band: CalendarBand,
  openMinute: number,
  closeMinute: number,
): PositionedBand | null {
  const start = Math.max(band.start_min, openMinute);
  const end = Math.min(band.end_min, closeMinute);
  if (end <= start) return null;

  return {
    band,
    top: (start - openMinute) * PX_PER_MIN,
    height: (end - start) * PX_PER_MIN,
  };
}

/**
 * Position and lane a column's bookings.
 *
 * Two things happen here that both have to, and both for the same reason —
 * a block you cannot see is a client nobody serves:
 *
 *   Clamping. A booking that starts before open would otherwise get a negative
 *   `top` and render above the grid; one running past close would overflow the
 *   container. Both are cut to the grid and flagged, so the block shows a
 *   cut-off edge rather than silently misrepresenting its own time.
 *
 *   Lanes. Two bookings on one tech at one time is a real mistake a manager
 *   needs to see. Stacking them would hide one. They go side by side, and the
 *   cluster — not the whole column — sets the width, so one double-booked hour
 *   does not squeeze the rest of the day to a sliver.
 */
function position(
  appointments: CalendarAppointment[],
  openMinute: number,
  closeMinute: number,
): PositionedAppointment[] {
  const sorted = [...appointments].sort(
    (a, b) => a.start_min - b.start_min || b.duration_min - a.duration_min,
  );

  const out: PositionedAppointment[] = [];
  let cluster: PositionedAppointment[] = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const entry of cluster) entry.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const appointment of sorted) {
    const rawStart = appointment.start_min;
    const rawEnd = rawStart + appointment.duration_min;

    const start = Math.max(rawStart, openMinute);
    const end = Math.min(rawEnd, closeMinute);

    // Entirely outside the open day — nothing to draw, and drawing it would
    // put a block at the grid's edge claiming a time it does not have.
    if (end <= start) continue;

    if (start >= clusterEnd && cluster.length > 0) flush();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    cluster.push({
      appointment,
      top: (start - openMinute) * PX_PER_MIN,
      height: (end - start) * PX_PER_MIN,
      lane,
      lanes: 1,
      clippedStart: rawStart < openMinute,
      clippedEnd: rawEnd > closeMinute,
      terse: end - start < TERSE_BLOCK_MINUTES,
    });
    clusterEnd = Math.max(clusterEnd, end);
  }

  if (cluster.length > 0) flush();
  return out;
}

/** "9 AM", "12 PM", "8 PM" — the gutter marks. */
export function hourLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/** "9:00", "2:30" — a block's own start time. */
export function minuteLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute % 60).padStart(2, "0")}`;
}

/** "Rosa D." — a client is a person, not a phone number. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * The salon's current wall-clock minute, or null when the viewed day is not
 * today. Drives the now-line, which is meaningless on any other day.
 */
export function nowMinuteInSalon(timezone: string, day: string, at = new Date()): number | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  if (today !== day) return null;

  return Number(get("hour")) * 60 + Number(get("minute"));
}
