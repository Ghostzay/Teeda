/** Domain types used across the app. Everything derives from the generated DB types. */
import type { Enums, FunctionReturns, Tables } from "./database";

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database";

export type Salon = Tables<"salons">;
export type Profile = Tables<"profiles">;
export type Customer = Tables<"customers">;
export type Job = Tables<"jobs">;
export type Appointment = Tables<"appointments">;
export type Payment = Tables<"payments">;

export type UserRole = Enums<"user_role">;
export type JobType = Enums<"job_type">;
export type JobStatus = Enums<"job_status">;
export type AppointmentStatus = Enums<"appointment_status">;
export type PaymentMethod = Enums<"payment_method">;

/** One row of the rotation board, as returned by the `turn_queue` RPC. */
export type TurnQueueEntry = FunctionReturns<"turn_queue">[number];

/** Today's till, as returned by `payment_totals_today`. */
export type PaymentTotals = FunctionReturns<"payment_totals_today">[number];

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
  manager: "Manager",
  admin: "Admin",
  tech: "Tech",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  manager: "Full access, including settings, team and takings.",
  admin: "Runs the floor — check-ins, jobs, queue and payments. No settings.",
  tech: "Their own turn, clients and appointments.",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  other: "Other",
};

/** Quick-pick services offered in the job and appointment forms. */
export const COMMON_SERVICES = [
  "Manicure",
  "Pedicure",
  "Gel manicure",
  "Gel pedicure",
  "Full set acrylic",
  "Acrylic fill",
  "Dip powder",
  "Nail art",
  "Polish change",
  "Removal",
] as const;
