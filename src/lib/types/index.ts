/** Domain types used across the app. Everything derives from the generated DB types. */
import type { Enums, FunctionReturns, Tables } from "./database";

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database";

export type Salon = Tables<"salons">;
export type Profile = Tables<"profiles">;
export type Customer = Tables<"customers">;
export type Job = Tables<"jobs">;
export type Appointment = Tables<"appointments">;

export type UserRole = Enums<"user_role">;
export type JobType = Enums<"job_type">;
export type JobStatus = Enums<"job_status">;
export type AppointmentStatus = Enums<"appointment_status">;

/** One row of the rotation board, as returned by the `turn_queue` RPC. */
export type TurnQueueEntry = FunctionReturns<"turn_queue">[number];

/** The signed-in user plus their salon — resolved once per request. */
export type SessionContext = {
  userId: string;
  email: string;
  profile: Profile;
  salon: Salon;
  isManager: boolean;
};

/** Job joined with the names needed to render a queue card. */
export type JobWithRelations = Job & {
  customer: Pick<Customer, "id" | "name" | "phone"> | null;
  tech: Pick<Profile, "id" | "full_name"> | null;
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

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
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
