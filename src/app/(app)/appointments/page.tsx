import { AppointmentForm } from "@/components/appointment-form";
import { BookingList } from "@/components/booking-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { toDateInputValue } from "@/lib/format";
import {
  getActiveTechs,
  getAppointments,
  getCustomerOptions,
  getSalonDayBounds,
  getServices,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Bookings for one day.
 *
 * The day window comes from the database, in the salon's timezone. It used to
 * be built from `new Date(y, m, d)` in the app, which is midnight wherever the
 * Node process runs — UTC on Vercel — so for a New York salon the window ran
 * 8pm to 8pm and evening bookings simply did not appear on their own day.
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { date } = await searchParams;

  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateInputValue();
  const range = await getSalonDayBounds(selectedDate);

  const [appointments, customers, techs, services] = await Promise.all([
    getAppointments(range),
    getCustomerOptions(),
    getActiveTechs(),
    getServices(),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-display">Bookings</h1>
        <p className="mt-1 text-sm text-secondary-text">
          Tap any booking to see it or change it. Checking one in creates a job and drops the
          client into the rotation.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <BookingList
          selectedDate={selectedDate}
          appointments={appointments}
          customers={customers}
          techs={techs}
          services={services}
          canManageFloor={session.canManageFloor}
        />

        {session.canManageFloor ? (
          <Card className="lg:sticky lg:top-0 lg:self-start">
            <CardHeader className="pb-3">
              <CardTitle>Book an appointment</CardTitle>
            </CardHeader>
            <CardContent>
              <AppointmentForm
                customers={customers}
                techs={techs}
                services={services}
                defaultDate={selectedDate}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
