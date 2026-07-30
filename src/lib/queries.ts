import "server-only";

import { createClient } from "@/lib/supabase/server";
import { describeSetupError } from "@/lib/setup-error";

import type {
  AppNotification,
  AppointmentWithRelations,
  AvailabilityPattern,
  Customer,
  DayAvailability,
  DayCalendar,
  FloorStatus,
  JobStatus,
  JobWithRelations,
  KioskDevice,
  PaymentTotals,
  Profile,
  SalonEarningsRow,
  ScheduleEntry,
  ScheduleItem,
  ClientHistoryEntry,
  ClientSummary,
  ServiceLogEntry,
  ServiceMenuItem,
  ServiceTechOption,
  TeamSkillRow,
  TechEarnings,
  TechProfile,
  TakingsComparison,
  TodayStats,
  TurnCheckin,
  UnmarkedTech,
} from "@/lib/types";

const JOB_SELECT =
  "*, customer:customers(id, name, phone), tech:profiles(id, full_name), payment:payments(*), services:job_services(*)";
const APPOINTMENT_SELECT = "*, customer:customers(id, name, phone), tech:profiles(id, full_name)";

/**
 * When the salon's day started, as an ISO instant.
 *
 * Every "today" filter in this file goes through here. Previously each one
 * computed midnight in the Node process's timezone, which is the server's
 * opinion rather than the salon's — see `getTodayStats` for what that cost.
 */
async function salonDayStart(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("salon_day_start", { p_salon_id: null });
  if (error || !data) {
    // Fall back to UTC midnight rather than failing a whole page over a clock.
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  }
  return data;
}

function addDay(iso: string): string {
  return new Date(Date.parse(iso) + 24 * 60 * 60 * 1000).toISOString();
}

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
  if (options?.todayOnly) {
    const start = await salonDayStart();
    query = query.gte("checked_in_at", start).lt("checked_in_at", addDay(start));
  }

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
    .gte("completed_at", await salonDayStart())
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

/*
 * `getCustomerOptions()` lived here. It fetched up to five hundred clients so a
 * `<select>` could filter them in the browser — which put the salon's client
 * list in the page source of every booking form, and quietly omitted anybody
 * past the limit. Replaced by `staff_search_clients`, which never sends more
 * than ten rows and only ones that were asked for.
 */

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

/**
 * Header numbers for the manager dashboard.
 *
 * One RPC, one clock. This used to be four separate counts, two of which
 * defined "today" with a JS `startOfToday()` in the server's timezone while the
 * rotation board used `current_date` in Postgres. On a salon that isn't in UTC
 * those disagree for several hours every evening, which is how "0 on rotation"
 * could sit next to "5 done today". `today_stats` derives every figure from
 * `salon_day_start()`, so the numbers on this screen are now commensurable by
 * construction rather than by coincidence.
 */
export async function getTodayStats(): Promise<TodayStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("today_stats");

  if (error) throw new Error(`Failed to load today's numbers: ${error.message}`);

  return (
    data?.[0] ?? {
      waiting: 0,
      in_progress: 0,
      completed_today: 0,
      appointments_today: 0,
      checked_in: 0,
      on_shift: 0,
      day_start: new Date().toISOString(),
    }
  );
}

/**
 * A month of availability, already rolled up per tech per day.
 *
 * Dates are plain `yyyy-mm-dd` strings on purpose: the month grid reasons in
 * salon-local days, and the server has already resolved them in the salon's
 * timezone. Turning them back into Date objects here would re-introduce the
 * browser's timezone into a question that has nothing to do with it.
 */
export async function getMonthAvailability(
  from: string,
  to: string,
): Promise<{ days: DayAvailability[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("month_availability", { p_from: from, p_to: to });

  if (error) return { days: [], error: describeSetupError(error) };
  return { days: data ?? [], error: null };
}

/**
 * Today's takings against the same weekday last week.
 *
 * Same weekday, not yesterday: a salon's week has a shape, and comparing a
 * Tuesday to a Saturday would just produce an alarming red arrow every Monday.
 */
export async function getTakingsComparison(): Promise<TakingsComparison> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("takings_comparison");

  if (error || !data?.[0]) {
    return {
      today_total: 0,
      today_clients: 0,
      compared_total: 0,
      compared_clients: 0,
      compared_day: new Date().toISOString().slice(0, 10),
    };
  }
  return data[0];
}

/**
 * The start and end of a given calendar day, in the salon's timezone.
 *
 * `dayRange()` used to build this from `new Date(y, m, d)`, which is midnight
 * wherever the Node process runs — UTC on Vercel. For a New York salon that
 * window ran 8pm to 8pm, so a 9pm booking landed on the next day and the
 * previous evening's bookings appeared in today. One clock, one answer.
 */
export async function getSalonDayBounds(day: string): Promise<{ start: string; end: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("salon_day_bounds", { p_day: day });

  if (error || !data?.[0]) {
    // A page with a slightly wrong window still beats a page that throws.
    const [y, m, d] = day.split("-").map(Number);
    return {
      start: new Date(Date.UTC(y, m - 1, d)).toISOString(),
      end: new Date(Date.UTC(y, m - 1, d + 1)).toISOString(),
    };
  }
  return { start: data[0].starts_at, end: data[0].ends_at };
}

/**
 * Waiting, in service and finished for one day.
 *
 * The floor sees everyone; a tech sees only their own, enforced in SQL rather
 * than by what the caller passes.
 */
export async function getServiceLog(day?: string, techId?: string): Promise<ServiceLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("service_log", {
    p_day: day ?? null,
    p_tech_id: techId ?? null,
  });

  if (error) return [];
  return data ?? [];
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

/** A client's past visits and future bookings, newest first. */
export async function getClientHistory(id: string): Promise<ClientHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_history", { p_customer_id: id });
  if (error) return [];
  return data ?? [];
}

export async function getClientSummary(id: string): Promise<ClientSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_summary", { p_customer_id: id });
  if (error) return null;
  return data?.[0] ?? null;
}

/**
 * A tech's extended profile.
 *
 * RLS returns nothing to anyone but the tech themselves and a manager, so a
 * null here is an answer rather than an error — admins get null by design,
 * because next of kin is not something running the floor requires.
 */
export async function getTechProfile(techId: string): Promise<TechProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tech_profiles")
    .select("*")
    .eq("tech_id", techId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Whether a team member can be deleted outright, and why not if they cannot.
 *
 * Asked before the manager commits to anything, so the confirmation can say
 * "they have 40 payments on record" rather than failing after the fact.
 */
export async function getTechDeletionCheck(techId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tech_deletion_check", { p_tech_id: techId });
  if (error) return null;
  return data?.[0] ?? null;
}

/** The whole team's skills as one grid, for the Skills tab. */
export async function getTeamSkills(): Promise<TeamSkillRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_skills");
  if (error) return [];
  return data ?? [];
}

/** Every tech's usual week, for the pattern editor and the read-back. */
export async function getAvailabilityPatterns(): Promise<AvailabilityPattern[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("availability_patterns_for_salon");
  if (error) return [];
  return data ?? [];
}

/**
 * Who has nothing on the calendar in the next `days`.
 *
 * The month view only helps if it gets filled in, and nobody remembers to fill
 * in a calendar. This is what lets a screen say so to the person who can fix it.
 */
export async function getUnmarkedTechs(days = 7): Promise<UnmarkedTech[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unmarked_techs", { p_days: days });
  if (error) return [];
  return data ?? [];
}

/**
 * One row per active tech: shift, break, current client, today's count and
 * take. Assembled in SQL so the dashboard rail is a single round trip however
 * large the roster gets.
 */
export async function getFloorStatus(): Promise<FloorStatus[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("floor_status");

  if (error) throw new Error(`Failed to load the floor: ${error.message}`);
  return data ?? [];
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

/**
 * The menu, grouped and with skills resolved.
 *
 * Prefer this over `getServices` anywhere the answer matters to staffing:
 * `services.required_skills` now holds only the *extras* a manager typed, so
 * reading that column alone says a manicure needs no skills at all.
 */
export async function getServiceMenu(includeInactive = false): Promise<ServiceMenuItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("service_menu", {
    p_include_inactive: includeInactive,
  });

  if (error) throw new Error(`Failed to load the menu: ${error.message}`);
  return (data ?? []).map((row) => ({ ...row, price: Number(row.price) }));
}

/**
 * Who can do this service, eligible first.
 *
 * Both the booking form and the assign control need this, and working it out
 * in two places is how they come to disagree about who is allowed.
 */
export async function getTechsForService(serviceId: string): Promise<ServiceTechOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("techs_for_service", { p_service_id: serviceId });
  if (error) return [];
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
/**
 * One day of the floor calendar, in one round trip.
 *
 * Deliberately a single call: the previous day view fetched an overlay and then
 * worked out columns, durations and the day's bounds in the browser, which is
 * three places to disagree about a timezone. Everything comes back already
 * resolved to salon-local minutes.
 */
export async function getDayCalendar(
  day: string,
  techId?: string | null,
): Promise<{ data: DayCalendar | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("day_calendar", {
    p_day: day,
    p_tech_id: techId ?? null,
  });

  if (error) return { data: null, error: describeSetupError(error) };
  return { data: data as DayCalendar, error: null };
}

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

/**
 * The salon's check-in tablets, for the settings screen.
 *
 * `hasExitPin` rather than the PIN: the hash never needs to leave the database
 * and a boolean is all the UI can act on.
 */
export async function getKioskDevices(): Promise<{
  devices: KioskDevice[];
  hasExitPin: boolean;
}> {
  const supabase = await createClient();

  const [{ data: devices }, { data: salon }] = await Promise.all([
    supabase.from("kiosk_devices").select("*").order("label", { ascending: true }),
    // Only ever coerced to a boolean here: the hash has no business crossing
    // into a client component, and there is nothing the UI can do with it.
    supabase.from("salons").select("kiosk_exit_pin_hash").maybeSingle(),
  ]);

  return { devices: devices ?? [], hasExitPin: Boolean(salon?.kiosk_exit_pin_hash) };
}
