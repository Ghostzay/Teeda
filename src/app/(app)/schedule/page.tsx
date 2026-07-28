import { NotificationsCard } from "@/components/notifications-card";
import { TechAppointments } from "@/components/tech-appointments";
import { requireSession } from "@/lib/auth";
import { getNotifications, getTechAppointments } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** A tech's own book — today and tomorrow, plus anything they've been told. */
export default async function SchedulePage() {
  const session = await requireSession();

  const [appointments, notifications] = await Promise.all([
    getTechAppointments(session.userId),
    getNotifications(10),
  ]);

  const total = appointments.today.length + appointments.tomorrow.length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My schedule</h1>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "Nothing booked with you today or tomorrow."
            : `${appointments.today.length} today · ${appointments.tomorrow.length} tomorrow`}
        </p>
      </header>

      <NotificationsCard notifications={notifications} />

      <TechAppointments today={appointments.today} tomorrow={appointments.tomorrow} />
    </div>
  );
}
