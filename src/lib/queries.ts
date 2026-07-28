import "server-only";

import { createClient } from "@/lib/supabase/server";
import { endOfToday, startOfToday } from "@/lib/format";
import type {
  AppointmentWithRelations,
  Customer,
  JobStatus,
  JobWithRelations,
  PaymentTotals,
  Profile,
} from "@/lib/types";

const JOB_SELECT =
  "*, customer:customers(id, name, phone), tech:profiles(id, full_name), payment:payments(*)";
const APPOINTMENT_SELECT = "*, customer:customers(id, name, phone), tech:profiles(id, full_name)";

/**
 * Read helpers shared by the pages. RLS scopes every one of these to the
 * caller's salon (and, for techs, to their own jobs plus the waiting queue),
 * so no query here needs to filter by salon defensively.
 */

/** `payment` comes back as an array from PostgREST; flatten to one or null. */
function normalizeJobs(rows: unknown[]): JobWithRelations[] {
  return (rows as (Omit<JobWithRelations, "payment"> & { payment: unknown })[]).map((row) => ({
    ...row,
    payment: Array.isArray(row.payment) ? (row.payment[0] ?? null) : (row.payment ?? null),
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
