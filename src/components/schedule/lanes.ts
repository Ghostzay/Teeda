import type { ScheduleItem } from "@/lib/types";

export type LaidOutItem = {
  item: ScheduleItem;
  /** 0-based lane within its overlap cluster. */
  lane: number;
  /** How many lanes that cluster needs. */
  lanes: number;
};

/**
 * Side-by-side layout for overlapping items.
 *
 * Items that overlap in time are grouped into a cluster, and every item in a
 * cluster is given a lane. The cluster — not the whole column — decides the
 * width, so one busy hour doesn't squeeze the rest of the day.
 *
 * Overlap is real here rather than theoretical: a shift, an appointment inside
 * it and a walk-in check-in can all cover the same minutes for one tech.
 */
export function layoutLanes(items: ScheduleItem[]): LaidOutItem[] {
  const sorted = [...items].sort(
    (a, b) =>
      Date.parse(a.starts_at) - Date.parse(b.starts_at) ||
      Date.parse(b.ends_at) - Date.parse(a.ends_at),
  );

  const out: LaidOutItem[] = [];
  let cluster: LaidOutItem[] = [];
  // When the current cluster ends. A new item starting at or after this begins
  // a fresh cluster.
  let clusterEnd = -Infinity;
  // Per-lane end times within the current cluster.
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const entry of cluster) entry.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    const start = Date.parse(item.starts_at);
    const end = Date.parse(item.ends_at);

    if (start >= clusterEnd && cluster.length > 0) flush();

    // First lane that is free at `start`; otherwise open a new one.
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }

  if (cluster.length > 0) flush();
  return out;
}

/** Round a time down to the nearest slot boundary. */
export function snapToSlot(date: Date, slotMinutes: number): Date {
  const snapped = new Date(date);
  snapped.setSeconds(0, 0);
  snapped.setMinutes(Math.floor(snapped.getMinutes() / slotMinutes) * slotMinutes);
  return snapped;
}

/** "14:30" — the value an <input type="time"> expects. */
export function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
