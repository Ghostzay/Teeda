import type { UserRole } from "@/lib/types";

/**
 * The dashboard widget catalogue.
 *
 * ---------------------------------------------------------------------------
 * Why a catalogue and not just stored rows
 * ---------------------------------------------------------------------------
 * A saved layout is a *preference*, not a definition. If it were the whole
 * truth, the day a new widget ships everyone who had ever customised their
 * dashboard would never see it — their saved list simply wouldn't mention it,
 * and it would look like the feature never shipped.
 *
 * So `resolveLayout` merges: the saved layout supplies order and slot, anything
 * the catalogue has gained since is appended to its own default slot, and
 * anything the catalogue has lost is dropped. Only an explicit entry in
 * `hidden` keeps a widget off the screen.
 *
 * ---------------------------------------------------------------------------
 * Adding a widget
 * ---------------------------------------------------------------------------
 *   1. Add an entry here, with its default slot and its data dependencies.
 *   2. Render it in the dashboard page's `nodes` map.
 *
 * No migration, and existing layouts pick it up automatically.
 */

/** Three slots, not free positioning — see the note on sizing in the README. */
export type Slot = "full" | "main" | "side";

export type WidgetId =
  | "needs_attention"
  | "calendar_gaps"
  | "waiting_longest"
  | "waiting_queue"
  | "in_service"
  | "whats_coming"
  | "takings_trend"
  | "turn_rotation"
  | "floor_cards"
  | "unpaid_tickets"
  | "service_log"
  | "money";

/**
 * What a widget needs fetched. The page unions the deps of *visible* widgets
 * and fetches only those, so hiding a panel actually makes the page faster
 * rather than just making it shorter.
 */
export type DataKey =
  | "jobs"
  | "queue"
  | "floor"
  | "finished"
  | "totals"
  | "techs"
  | "services"
  | "bookings"
  | "unmarked"
  | "trend"
  | "log";

export type Widget = {
  id: WidgetId;
  title: string;
  /** One line in the customise panel, explaining what it is for. */
  description: string;
  defaultSlot: Slot;
  /** Position within the default slot when a layout has never mentioned it. */
  defaultOrder: number;
  /** Off by default — available, but not in the recommended layout. */
  defaultHidden?: boolean;
  needs: DataKey[];
  /** Manager-only widgets. Omitted means anyone who can reach the dashboard. */
  managerOnly?: boolean;
};

export const WIDGETS: Widget[] = [
  {
    id: "needs_attention",
    title: "Needs attention",
    description: "Long waits, unassigned bookings, unpaid tickets, missing techs.",
    defaultSlot: "full",
    defaultOrder: 0,
    needs: ["jobs", "finished", "bookings", "floor"],
  },
  {
    id: "calendar_gaps",
    title: "Calendar gaps",
    description: "Who has no days marked in the coming week.",
    defaultSlot: "full",
    defaultOrder: 1,
    needs: ["unmarked"],
  },
  {
    id: "waiting_longest",
    title: "Waiting longest",
    description: "The client who has waited most, with assign buttons.",
    defaultSlot: "main",
    defaultOrder: 0,
    needs: ["jobs", "queue"],
  },
  {
    id: "waiting_queue",
    title: "Waiting queue",
    description: "Everyone else waiting, with the same inline actions.",
    defaultSlot: "main",
    defaultOrder: 1,
    needs: ["jobs", "queue", "techs", "services"],
  },
  {
    id: "in_service",
    title: "In service now",
    description: "Who is in a chair, and for how long.",
    defaultSlot: "main",
    defaultOrder: 2,
    needs: ["jobs", "techs", "services"],
  },
  {
    id: "whats_coming",
    title: "Still to come",
    description: "Bookings left today, next arrival, techs free.",
    defaultSlot: "side",
    defaultOrder: 0,
    needs: ["bookings", "queue"],
  },
  {
    id: "takings_trend",
    title: "Today vs. last week",
    description: "Money so far against the same weekday last week.",
    defaultSlot: "side",
    defaultOrder: 1,
    needs: ["trend"],
    managerOnly: true,
  },
  {
    id: "turn_rotation",
    title: "Turn rotation",
    description: "The fairness board, and check-in controls.",
    defaultSlot: "side",
    defaultOrder: 2,
    needs: ["queue"],
  },
  {
    id: "floor_cards",
    title: "On the floor",
    description: "A card per tech: status, clients today, earned today.",
    defaultSlot: "main",
    defaultOrder: 3,
    // Lives on Team by default; available here for anyone who wants it back.
    defaultHidden: true,
    needs: ["floor"],
  },
  {
    id: "unpaid_tickets",
    title: "Unpaid tickets",
    description: "Finished jobs with no payment recorded, as a working list.",
    defaultSlot: "main",
    defaultOrder: 4,
    defaultHidden: true,
    needs: ["finished", "techs", "services"],
    managerOnly: true,
  },
  {
    id: "service_log",
    title: "Today's services",
    description: "Waiting, in service and finished, in one panel.",
    defaultSlot: "main",
    defaultOrder: 5,
    needs: ["log"],
  },
  {
    id: "money",
    title: "Today's money",
    // Bottom of the main column, not the full-width band. The full-width band
    // renders above the two columns, so putting money there would place it
    // above the client who has been waiting 50 minutes — which inverts the
    // urgency ordering the whole page is arranged around. Anyone who wants it
    // edge-to-edge can move it there.
    description: "Collected, split between techs and salon.",
    defaultSlot: "main",
    defaultOrder: 9,
    needs: ["totals", "finished"],
  },
];

const BY_ID = new Map(WIDGETS.map((widget) => [widget.id, widget]));

export function widgetById(id: string): Widget | undefined {
  return BY_ID.get(id as WidgetId);
}

/** What is stored on the profile or the salon. Shape is validated on read. */
export type StoredLayout = {
  v?: number;
  full?: string[];
  main?: string[];
  side?: string[];
  hidden?: string[];
};

export type ResolvedLayout = {
  full: WidgetId[];
  main: WidgetId[];
  side: WidgetId[];
  hidden: WidgetId[];
};

export const LAYOUT_VERSION = 1;

/** Techs never reach the dashboard, but be explicit rather than implicit. */
export function canCustomiseDashboard(role: UserRole): boolean {
  return role !== "tech";
}

function allowedFor(role: UserRole): Widget[] {
  const isManager = role === "manager" || role === "super_admin";
  return WIDGETS.filter((widget) => !widget.managerOnly || isManager);
}

function asIdArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function parse(value: unknown): StoredLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as StoredLayout;
}

/**
 * saved → salon default → the recommended layout.
 *
 * Every widget the role is allowed ends up in exactly one of the four lists,
 * whatever the stored layout says. That invariant is what makes it safe to add
 * and remove widgets without touching anyone's saved preferences.
 */
export function resolveLayout(
  saved: unknown,
  salonDefault: unknown,
  role: UserRole,
): ResolvedLayout {
  const allowed = allowedFor(role);
  const allowedIds = new Set(allowed.map((widget) => widget.id));
  const source = parse(saved) ?? parse(salonDefault);

  const layout: ResolvedLayout = { full: [], main: [], side: [], hidden: [] };
  const placed = new Set<WidgetId>();

  if (source) {
    const hidden = new Set(asIdArray(source.hidden));

    for (const slot of ["full", "main", "side"] as const) {
      for (const id of asIdArray(source[slot])) {
        // Drop ids the catalogue no longer has, or this role cannot see.
        if (!allowedIds.has(id as WidgetId)) continue;
        if (placed.has(id as WidgetId)) continue;
        if (hidden.has(id)) continue;
        layout[slot].push(id as WidgetId);
        placed.add(id as WidgetId);
      }
    }

    for (const id of hidden) {
      if (!allowedIds.has(id as WidgetId) || placed.has(id as WidgetId)) continue;
      layout.hidden.push(id as WidgetId);
      placed.add(id as WidgetId);
    }
  }

  // Anything the stored layout never mentioned — including widgets added since
  // it was saved — takes its own default position rather than vanishing.
  const remaining = allowed
    .filter((widget) => !placed.has(widget.id))
    .sort((a, b) => a.defaultOrder - b.defaultOrder);

  for (const widget of remaining) {
    // A brand-new widget that ships hidden stays hidden; one that ships visible
    // appears, which is the whole point of merging rather than replacing.
    if (widget.defaultHidden && source) layout.hidden.push(widget.id);
    else if (widget.defaultHidden) layout.hidden.push(widget.id);
    else layout[widget.defaultSlot].push(widget.id);
  }

  return layout;
}

/** The recommended layout, for the reset button. */
export function defaultLayout(role: UserRole): ResolvedLayout {
  return resolveLayout(null, null, role);
}

export function toStored(layout: ResolvedLayout): StoredLayout {
  return {
    v: LAYOUT_VERSION,
    full: layout.full,
    main: layout.main,
    side: layout.side,
    hidden: layout.hidden,
  };
}

/** Which queries the page actually has to run for this layout. */
export function requiredData(layout: ResolvedLayout): Set<DataKey> {
  const keys = new Set<DataKey>();
  for (const id of [...layout.full, ...layout.main, ...layout.side]) {
    const widget = BY_ID.get(id);
    if (!widget) continue;
    for (const key of widget.needs) keys.add(key);
  }
  return keys;
}
