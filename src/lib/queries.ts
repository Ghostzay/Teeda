import "server-only";

import { createClient } from "@/lib/supabase/server";
import { endOfToday, startOfToday } from "@/lib/format";
import type {
  AppointmentWithRelations,
  Customer,
  JobStatus,
  JobWithRelations,
  Profile,
} from "@/lib/types";

const JOB_SELECT = "*, customer:customers(id, name, phone), tech:profiles(id, full_name)";
const APPOINTMENT_SELECT = "*, customer:customers(id, name, phone), tech:profiles(id, full_name)";

/**
 * Read helpers shared by the pages. RLS scopes every one of these to the
 * caller's salon (and, for techs, to their own jobs plus the waiting queue),
 * so no query here needs to filter by salon defensively.
 */

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
  return (data ?? []) as unknown as JobWithRelations[];
}

/** The live floor: everything not yet finished, oldest check-in first. */
export async function getActiveJobs(): Promise<JobWithRelations[]> {
  return getJobs({ statuses: ["waiting", "in_progress"] });
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
  return (data as unknown as JobWithRelations) ?? null;
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
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(`Failed to load appointments: ${error.message}`);
  return (data ?? []) as unknown as AppointmentWithRelations[];
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
