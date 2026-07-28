import "server-only";

import { createClient } from "@/lib/supabase/server";
import { describeSetupError } from "@/lib/setup-error";
import { endOfToday, startOfToday } from "@/lib/format";
import type {
  AppNotification,
  AppointmentWithRelations,
  Customer,
  JobStatus,
  JobWithRelations,
  PaymentTotals,
  Profile,
  SalonEarningsRow,
  ScheduleEntry,
  ScheduleItem,
  Service,
  TechEarnings,
  TurnCheckin,
} from "@/lib/types";

const JOB_SELECT =
  "*, customer:customers(id, name, phone), tech:profiles(id, full_name), payment:payments(*), services:job_services(*)";
const APPOINTMENT_SELECT = "*, customer:customers(id, name, phone), tech:profiles(id, full_name)";

/**
 * Read helpers shared by the pages. RLS scopes every one of these to the
 * caller's salon (and, for techs, to their own jobs plus the waiting queue),
 * so no query here needs to filter by salon defensively.
 */

/**
 * PostgREST returns embedded one-to-one rows as arrays. Flatten `payment` to a
 * single row (or null) and default `services` to an array.
 */
function normalizeJobs(rows: unknown[]): JobWithRelations[] {
  return (rows as { payment: unknown; services: unknown }[]).map((row) => ({
    ...row,
    payment: Array.isArray(row.payment) ? (row.payment[0] ?? null) : (row.payment ?? null),
    services: Array.isArray(row.services) ? row.services : [],
  })) as JobWithRelations[];
}

export async function getJobs(options?: {
  statuses?: JobStatus[];
  techId?: string;
  todayOnly?: boolean;
  limit?: number;
}): Promise<JobWithRelations[]> {
  const supabase = await createClient();

  let query = supabase.from("jobs").select(JOB_SELECT);

  if (options?.statuses?.length) query = query.in("status", options.statuses);
  if (options?.techId) query = query.eq("tech_id", options.techId);
  if (options?.todayOnly) query = query.gte("checked_in_at", startOfToday()).lt("checked_in_at", endOfToday());

  const { data, error } = await query
    .order("checked_in_at", { ascending: true })
    .limit(options?.limit ?? 200);

  if (error) throw new Error(`Failed to load jobs: ${error.message}`);
  return normalizeJobs(data ?? []);
}

/** The live floor: everything not yet finished, oldest check-in first. */
export async function getActiveJobs(): Promise<JobWithRelations[]> {
  return getJobs({ statuses: ["waiting", "in_progress"] });
}

/** Most recently finished first — the "just wrapped up" strip. */
export async function getRecentlyCompleted(limit = 8): Promise<JobWithRelations[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("status", "completed")
    .gte("completed_at", startOfToday())
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load finished jobs: ${error.message}`);
  return normalizeJobs(data ?? []);
}

export async function getTechCurrentJob(techId: string): Promise<JobWithRelations | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("tech_id", techId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (error) throw new Error(`Failed to load current job: ${error.message}`);
  return data ? normalizeJobs([data])[0] : null;
}

export async function getCustomers(search?: string): Promise<Customer[]> {
  const supabase = await createClient();

  let query = supabase.from("customers").select("*");

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`name.ilike.${term},phone.ilike.${term}`);
  }

  const { data, error } = await query.order("name", { ascending: true }).limit(300);

  if (error) throw new Error(`Failed to load customers: ${error.message}`);
  return data ?? [];
}

/** Minimal customer list for the pickers on the job and appointment forms. */
export async function getCustomerOptions(): Promise<Pick<Customer, "id" | "name" | "phone">[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .order("name", { ascending: true })
    .limit(500);

  if (error) throw new Error(`Failed to load customers: ${error.message}`);
  return data ?? [];
}

export async function getStaff(): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });

  if (error) throw new Error(`Failed to load staff: ${error.message}`);
  return data ?? [];
}

export async function getActiveTechs(): Promise<Profile[]> {
  const staff = await getStaff();
  return staff.filter((person) => person.role === "tech" && person.is_active);
}

export async function getAppointments(range: {
  start: string;
  end: string;
}): Promise<AppointmentWithRelations[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .gte("scheduled_at", range.start)
    .lt("scheduled_at", range.end)
    .order("scheduled_at", { ascending: true })
    .neq("status", "cancelled");

  if (error) throw new Error(`Failed to load appointments: ${error.message}`);
  return (data ?? []) as unknown as AppointmentWithRelations[];
}

/**
 * A tech's own appointments for today and tomorrow.
 * RLS already limits techs to `tech_id = auth.uid()`, but the filter is
 * explicit so managers viewing the same helper get the same shape.
 */
export async function getTechAppointments(techId: string): Promise<{
  today: AppointmentWithRelations[];
  tomorrow: AppointmentWithRelations[];
}> {
  const supabase = await createClient();

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("tech_id", techId)
    .gte("scheduled_at", startToday.toISOString())
    .lt("scheduled_at", endTomorrow.toISOString())
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(`Failed to load your appointments: ${error.message}`);

  const rows = (data ?? []) as unknown as AppointmentWithRelations[];
  const boundary = startTomorrow.getTime();

  return {
    today: rows.filter((row) => Date.parse(row.scheduled_at) < boundary),
    tomorrow: rows.filter((row) => Date.parse(row.scheduled_at) >= boundary),
  };
}

/** Header numbers for the manager dashboard. */
export async function getTodayStats() {
  const supabase = await createClient();
  const start = startOfToday();
  const end = endOfToday();

  const [waiting, inProgress, completed, appointments] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", start)
      .lt("completed_at", end),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .gte("scheduled_at", start)
      .lt("scheduled_at", end),
  ]);

  return {
    waiting: waiting.count ?? 0,
    inProgress: inProgress.count ?? 0,
    completedToday: completed.count ?? 0,
    appointmentsToday: appointments.count ?? 0,
  };
}

/** Today's till. Front desk only — RLS returns zeros to anyone else. */
export async function getPaymentTotals(): Promise<PaymentTotals> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payment_totals_today");

  if (error) throw new Error(`Failed to load takings: ${error.message}`);

  return (
    data?.[0] ?? {
      service_total: 0,
      tip_total: 0,
      payment_count: 0,
      cash_total: 0,
      card_total: 0,
    }
  );
}

/** The one money figure a tech can see: their own tips today. */
export async function getMyTipsToday(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_tips_today");

  if (error) return 0;
  return Number(data ?? 0);
}

// ---------------------------------------------------------------------------
// Services, skills, check-ins, earnings and notifications
// ---------------------------------------------------------------------------

/** The salon's price list. Pass `false` to include retired services. */
export async function getServices(activeOnly = true): Promise<Service[]> {
  const supabase = await createClient();

  let query = supabase.from("services").select("*");
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load services: ${error.message}`);
  return data ?? [];
}

/** Today's check-in rows for the salon, keyed by tech. */
export async function getTodayCheckins(): Promise<Map<string, TurnCheckin>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("turn_checkins")
    .select("*")
    .eq("checkin_date", new Date().toLocaleDateString("en-CA"));

  if (error) throw new Error(`Failed to load check-ins: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.tech_id, row]));
}

/** Whether the signed-in tech has opted into today's rotation. */
export async function amICheckedIn(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("am_i_checked_in");

  if (error) return false;
  return Boolean(data);
}

/** A tech's earnings for today, this week and the current pay period. */
export async function getTechEarnings(techId?: string): Promise<TechEarnings> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tech_earnings", { p_tech_id: techId ?? null });

  if (error) throw new Error(`Failed to load earnings: ${error.message}`);

  const rows = data ?? [];
  const find = (scope: string) => rows.find((row) => row.scope === scope) ?? null;

  return { today: find("today"), week: find("week"), period: find("period") };
}

/** Manager overview: every tech's performance over a window. */
export async function getSalonEarnings(
  scope: "today" | "week" | "period" = "today",
): Promise<SalonEarningsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("salon_earnings", { p_scope: scope });

  if (error) throw new Error(`Failed to load salon earnings: ${error.message}`);
  return data ?? [];
}

export async function getNotifications(limit = 15): Promise<AppNotification[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Schedule and commission
// ---------------------------------------------------------------------------

/**
 * Blocks overlapping a window, tech name attached.
 * Pass `techId` for a single column; omit it for the whole salon.
 */
export async function getSchedule(
  from: Date,
  to: Date,
  techId?: string | null,
): Promise<ScheduleEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("schedule_for_range", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tech_id: techId ?? null,
  });

  if (error) throw new Error(`Failed to load the schedule: ${error.message}`);
  return data ?? [];
}

/** Commission rates by tech id. Managers see everyone; a tech sees themselves. */
export async function getCommissionRates(): Promise<Map<string, number | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tech_pay").select("tech_id, commission_percent");

  if (error) return new Map();
  return new Map((data ?? []).map((row) => [row.tech_id, row.commission_percent]));
}

/**
 * Everything the schedule grid draws, in one round trip.
 *
 * Returns a discriminated result rather than throwing: a missing migration
 * used to take the whole route down with a server-side exception, and the
 * schedule is exactly where that is least acceptable. The page renders the
 * message instead.
 */
export async function getScheduleOverlay(
  from: Date,
  to: Date,
  techId?: string | null,
): Promise<{ items: ScheduleItem[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("schedule_overlay", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tech_id: techId ?? null,
  });

  if (error) return { items: [], error: describeSetupError(error) };
  return { items: data ?? [], error: null };
}
