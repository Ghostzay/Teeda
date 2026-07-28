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

export type UserRole = Enums<"user_role">;
export type JobType = Enums<"job_type">;
export type JobStatus = Enums<"job_status">;
export type AppointmentStatus = Enums<"appointment_status">;
export type PaymentMethod = Enums<"payment_method">;
export type Skill = Enums<"skill">;
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
 * Three roles, two capability lines:
 *   canManageFloor  manager + admin — check-ins, jobs, queue, payments
 *   isManager       manager only    — salon settings, team roster, money reports
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
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  super_admin: "The salon owner. Same access as a manager.",
  manager: "Full access, including settings, team and takings.",
  admin: "Runs the floor — check-ins, jobs, queue and payments. No settings.",
  tech: "Their own turn, clients and appointments.",
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
