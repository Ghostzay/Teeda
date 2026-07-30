/** Domain types used across the app. Everything derives from the generated DB types. */
import type { Enums, FunctionReturns, Tables } from "./database";

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database";

export type Salon = Tables<"salons">;
export type Profile = Tables<"profiles">;
export type Customer = Tables<"customers">;
export type Job = Tables<"jobs">;
export type Appointment = Tables<"appointments">;
export type Payment = Tables<"payments">;
export type TechPay = Tables<"tech_pay">;
export type ScheduleBlock = Tables<"schedule_blocks">;
export type ShiftBlock = Tables<"shift_blocks">;
export type Service = Tables<"services">;
export type JobService = Tables<"job_services">;
export type TurnCheckin = Tables<"turn_checkins">;
export type AppNotification = Tables<"notifications">;
export type TechProfile = Tables<"tech_profiles">;

export type UserRole = Enums<"user_role">;
export type JobType = Enums<"job_type">;
export type JobStatus = Enums<"job_status">;
export type AppointmentStatus = Enums<"appointment_status">;
export type PaymentMethod = Enums<"payment_method">;
export type Skill = Enums<"skill">;
export type ServiceCategory = Enums<"service_category">;
export type BlockKind = Enums<"block_kind">;
export type ShiftKind = Enums<"shift_kind">;
export type NotificationType = Enums<"notification_type">;

/** One row of the rotation board, as returned by the `turn_queue` RPC. */
export type TurnQueueEntry = FunctionReturns<"turn_queue">[number];

/** Today's till, as returned by `payment_totals_today`. */
export type PaymentTotals = FunctionReturns<"payment_totals_today">[number];

/**
 * Every count on the dashboard header, from one query on the salon's clock.
 * Replaces four separate reads that each decided for themselves when "today"
 * started — which is how "0 on rotation" and "5 done today" came to disagree.
 */
export type TodayStats = FunctionReturns<"today_stats">[number];

/** One tech's card on the dashboard rail. */
export type FloorStatus = FunctionReturns<"floor_status">[number];

/** One tech's entry for one day in the month view. */
export type DayAvailability = FunctionReturns<"month_availability">[number];

/** A tech's usual week — the days they normally work. */
export type AvailabilityPattern = FunctionReturns<"availability_patterns_for_salon">[number];

/** A tech with nothing on the calendar in the window asked about. */
export type UnmarkedTech = FunctionReturns<"unmarked_techs">[number];

/** Today's takings against the same weekday last week. */
export type TakingsComparison = FunctionReturns<"takings_comparison">[number];

/** One line in the service log: a job with its status, tech and money. */
export type ServiceLogEntry = FunctionReturns<"service_log">[number];

/** One past visit or future booking on a client's profile. */
export type ClientHistoryEntry = FunctionReturns<"client_history">[number];

/** The headline numbers on a client's profile. */
export type ClientSummary = FunctionReturns<"client_summary">[number];

/** One row of the team skills grid. */
export type TeamSkillRow = FunctionReturns<"team_skills">[number];

/** One item on the menu, with its skills already resolved through the category. */
export type ServiceMenuItem = FunctionReturns<"service_menu">[number];

/** A tech, and whether they hold what a given service needs. */
export type ServiceTechOption = FunctionReturns<"techs_for_service">[number];

/** One line of what a client booked. A visit can be several services. */
export type AppointmentService = Tables<"appointment_services">;

/**
 * A tablet by the door. Its `profiles` row carries role 'kiosk', which every
 * restrictive policy in the database tests for.
 */
export type KioskDevice = Tables<"kiosk_devices">;

/** What the idle screen needs. No client data, so no rate limit on it. */
export type KioskContext = {
  salon_name: string;
  device_label: string;
  early_minutes: number;
  late_minutes: number;
  has_exit_pin: boolean;
};

/**
 * The answer to a phone lookup.
 *
 * `no_match` is deliberately indistinguishable between "that number is not a
 * client", "you typed nine digits" and "you typed a name" — the screen faces a
 * waiting room, and a different answer per case is a client directory.
 */
export type KioskLookup =
  | { result: "no_match" }
  | { result: "rate_limited" }
  | {
      result: "found";
      customer_id: string;
      client_name: string;
      masked_phone: string;
      state: "no_appointment";
      appointment: null;
    }
  | {
      result: "found";
      customer_id: string;
      client_name: string;
      masked_phone: string;
      state: "ready" | "too_early" | "too_late" | "already_checked_in" | "already_done";
      minutes_until: number;
      appointment: {
        id: string;
        scheduled_at: string;
        services: string;
        tech_name: string | null;
        status: AppointmentStatus;
      };
    };

/** One item on the kiosk's menu. Name, price and duration all come from the row. */
export type KioskService = FunctionReturns<"kiosk_service_menu">[number];

/** A tech who can take the chosen basket today, with their next opening. */
export type KioskTechOption = FunctionReturns<"kiosk_available_techs">[number];

/** A bookable start time. Computed only by `kiosk_available_slots` in SQL. */
export type KioskSlot = FunctionReturns<"kiosk_available_slots">[number];

/**
 * The answer to a booking attempt.
 *
 * `taken` is the one that matters: two kiosks, or a kiosk and an admin, will
 * collide, and the caller has to redraw the slot list rather than retry.
 */
export type KioskBooking =
  | {
      result: "booked";
      appointment_id: string;
      starts_at: string;
      minutes: number;
      services: string;
      tech_name: string | null;
      ahead: number;
    }
  | { result: "taken" | "invalid" | "no_services" | "invalid_basket" };

export type KioskCheckin =
  | { result: "checked_in"; tech_name: string | null; ahead: number }
  | { result: "not_found" | "already_checked_in" | "not_checkable" | "outside_window" };

/** A booking's basket, as the edit sheet reads it back. */
export type BasketLine = FunctionReturns<"appointment_basket">[number];

/**
 * One day of the floor calendar.
 *
 * Every `*_min` field is **salon-local minutes from midnight**, resolved once
 * by `day_calendar()` in SQL. Nothing downstream parses a date or names a
 * timezone — that is what makes the grid immune to the hour that DST moves.
 */
export type DayCalendar = {
  day: string;
  timezone: string;
  open_minute: number;
  close_minute: number;
  techs: { id: string; full_name: string; has_shift: boolean }[];
  bands: CalendarBand[];
  appointments: CalendarAppointment[];
  /** Bookings with nobody assigned — they get their own column. */
  unassigned_count: number;
};

export type CalendarBand = {
  tech_id: string;
  kind: ShiftKind;
  note: string | null;
  start_min: number;
  end_min: number;
};

export type CalendarAppointment = {
  id: string;
  tech_id: string | null;
  customer_id: string;
  client_name: string;
  status: AppointmentStatus;
  notes: string | null;
  service_name: string;
  /** The basket joined up, or the single service name. */
  services: string;
  start_min: number;
  duration_min: number;
};

/**
 * ISO weekday numbering, matching Postgres `extract(isodow)`. Monday-first
 * because that is how a rota is read, and because the month grid is too.
 */
export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
];

/** One earnings window (today / week / pay period) for a single tech. */
export type TechEarningsRow = FunctionReturns<"tech_earnings">[number];

/** One tech's line in the manager's earnings overview. */
export type SalonEarningsRow = FunctionReturns<"salon_earnings">[number];

/** A block on the schedule, with the tech's name already joined. */
export type ScheduleEntry = FunctionReturns<"schedule_for_range">[number];

/** One item drawn on the schedule grid, from any of the three layers. */
export type ScheduleItem = FunctionReturns<"schedule_overlay">[number];

/** Which data source an item came from. Drives its fill treatment. */
export type ScheduleLayer = "shift" | "appointment" | "walkin";

export const SHIFT_KIND_LABEL: Record<ShiftKind, { en: string; vi: string }> = {
  shift: { en: "Working", vi: "Đang làm" },
  break: { en: "Break", vi: "Nghỉ giải lao" },
  time_off: { en: "Time off", vi: "Nghỉ phép" },
};

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
  appointment: "Appointment",
  break: "Break",
  unavailable: "Unavailable",
};

/** Minutes of set-up and clean-down held either side of every booking. */
export const SCHEDULE_BUFFER_MINUTES = 5;

/** Earnings keyed by window, so the UI doesn't scan an array. */
export type TechEarnings = {
  today: TechEarningsRow | null;
  week: TechEarningsRow | null;
  period: TechEarningsRow | null;
};

/**
 * The signed-in user plus their salon — resolved once per request.
 *
 * Capability lines, narrowest last:
 *   canManageFloor  manager + admin — check-ins, jobs, queue, payments
 *   isManager       manager only    — salon settings, team roster, money reports
 *   isKiosk         a device, not a person — no floor access, no direct reads
 *
 * `canManageFloor` is computed from an allow-list. It has to be: when it was
 * `role !== "tech"`, adding any new role granted it floor access by default,
 * and the kiosk would have shipped rendering the salon's takings.
 */
export type SessionContext = {
  userId: string;
  email: string;
  profile: Profile;
  salon: Salon;
  role: UserRole;
  isSuperAdmin: boolean;
  isManager: boolean;
  isAdmin: boolean;
  isTech: boolean;
  isKiosk: boolean;
  canManageFloor: boolean;
};

/** Job joined with the names needed to render a queue card. */
export type JobWithRelations = Job & {
  customer: Pick<Customer, "id" | "name" | "phone"> | null;
  tech: Pick<Profile, "id" | "full_name"> | null;
  payment: Payment | null;
  /** Checkout line items, once the desk has rung them up. */
  services: JobService[];
};

export type AppointmentWithRelations = Appointment & {
  customer: Pick<Customer, "id" | "name" | "phone"> | null;
  tech: Pick<Profile, "id" | "full_name"> | null;
};

/** Uniform result shape for every server action, consumed by `useActionState`. */
export type ActionState = {
  ok: boolean;
  error?: string;
  message?: string;
};

export const EMPTY_ACTION_STATE: ActionState = { ok: false };

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  waiting: "Waiting",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Appointment wording the floor actually uses. */
export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Pending",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "Owner",
  manager: "Manager",
  admin: "Admin",
  tech: "Tech",
  kiosk: "Kiosk device",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  super_admin: "The salon owner. Same access as a manager.",
  manager: "Full access, including settings, team and takings.",
  admin: "Runs the floor — check-ins, jobs, queue and payments. No settings.",
  tech: "Their own turn, clients and appointments.",
  kiosk: "A check-in tablet. Reads nothing directly — only what the check-in screen shows.",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  other: "Other",
};

/**
 * The shared vocabulary between a service and a technician: a service says
 * which skills it needs, a tech says which they have, and the rotation only
 * offers work someone can actually do.
 */
export const SKILL_LABEL: Record<Skill, string> = {
  manicure: "Manicure",
  pedicure: "Pedicure",
  gel: "Gel",
  acrylic: "Acrylic",
  dip: "Dip powder",
  nail_art: "Nail art",
  waxing: "Waxing",
  lash: "Lashes",
};

export const ALL_SKILLS = Object.keys(SKILL_LABEL) as Skill[];

/**
 * The menu, grouped. A flat price list stops being usable somewhere around
 * twenty items, which is roughly where a real salon starts.
 */
export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  manicure: "Manicures",
  pedicure: "Pedicures",
  enhancement: "Enhancements",
  wax: "Waxing",
  addon: "Add-ons",
};

/** Singular, for the one-service-at-a-time places. */
export const SERVICE_CATEGORY_SINGULAR: Record<ServiceCategory, string> = {
  manicure: "Manicure",
  pedicure: "Pedicure",
  enhancement: "Enhancement",
  wax: "Wax",
  addon: "Add-on",
};

/** Menu order. Tabs read in the order a client would walk through them. */
export const ALL_SERVICE_CATEGORIES: ServiceCategory[] = [
  "manicure",
  "pedicure",
  "enhancement",
  "wax",
  "addon",
];

/**
 * The skill a category implies, mirroring `category_base_skills()` in SQL.
 *
 * Duplicated deliberately: the database is the authority — it resolves this
 * again on every save and every job snapshot — but the editor has to *show*
 * "Manicure (from the category)" before anything is saved, and a round trip
 * to find that out would make the form feel broken. If these two ever drift,
 * the database wins and the badge is merely wrong, never the rotation.
 *
 * Enhancements and add-ons have no base skill on purpose: acrylic, gel and dip
 * are genuinely different hands, so a shared base would let the rotation offer
 * an acrylic full set to someone who only does dip.
 */
export const CATEGORY_BASE_SKILLS: Record<ServiceCategory, Skill[]> = {
  manicure: ["manicure"],
  pedicure: ["pedicure"],
  enhancement: [],
  wax: ["waxing"],
  addon: [],
};

/** A line the desk is ringing up, before it's saved. */
export type CartLine = {
  service_id: string | null;
  name: string;
  price: number;
  quantity: number;
};

/**
 * Fallback quick-picks for a salon whose menu is empty. The `services` table
 * is the real source of truth everywhere it has rows.
 */
export const COMMON_SERVICES = [
  "Manicure",
  "Pedicure",
  "Gel manicure",
  "Full set acrylic",
  "Polish change",
] as const;
