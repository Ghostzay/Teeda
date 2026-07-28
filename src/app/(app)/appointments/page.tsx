import Link from "next/link";
import { CalendarDays, Phone, StickyNote } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { AppointmentForm } from "@/components/appointment-form";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cancelAppointment, checkInAppointment } from "@/lib/actions/appointments";
import { requireSession } from "@/lib/auth";
import { dayRange, formatDate, formatPhone, formatTime, toDateInputValue } from "@/lib/format";
import { getActiveTechs, getAppointments, getCustomerOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { date } = await searchParams;

  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateInputValue();
  const range = dayRange(selectedDate);

  const [appointments, customers, techs] = await Promise.all([
    getAppointments(range),
    getCustomerOptions(),
    getActiveTechs(),
  ]);

  const days = surroundingDays(selectedDate);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Appointments</h1>
        <p className="text-sm text-muted-foreground">
          Checking one in creates a job and drops the client into the rotation.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((day) => (
              <Link
                key={day.value}
                href={`/appointments?date=${day.value}`}
                className={cn(
                  "flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-sm transition-colors",
                  day.value === selectedDate
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-xs font-medium uppercase">{day.weekday}</span>
                <span className="text-lg font-semibold leading-tight tabular-nums">{day.day}</span>
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{formatDate(range.start)}</CardTitle>
              <span className="text-sm font-medium tabular-nums text-muted-foreground">
                {appointments.length}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {appointments.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="Nothing booked"
                  description="Book an appointment from the form."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {appointments.map((appointment) => (
                    <li key={appointment.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="w-16 shrink-0">
                        <p className="text-lg font-semibold leading-tight tabular-nums">
                          {formatTime(appointment.scheduled_at)}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">
                            {appointment.customer?.name ?? "Client"}
                          </p>
                          <AppointmentStatusBadge status={appointment.status} />
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {appointment.service_name} ·{" "}
                          {appointment.tech?.full_name ?? "No tech preference"}
                        </p>
                        {appointment.customer?.phone ? (
                          <a
                            href={`tel:${appointment.customer.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Phone className="size-3" />
                            {formatPhone(appointment.customer.phone)}
                          </a>
                        ) : null}
                        {appointment.notes ? (
                          <p className="inline-flex items-start gap-1 text-xs text-muted-foreground">
                            <StickyNote className="mt-0.5 size-3 shrink-0" />
                            {appointment.notes}
                          </p>
                        ) : null}
                      </div>

                      {session.isManager && appointment.status === "scheduled" ? (
                        <div className="flex shrink-0 gap-2">
                          <ActionButton
                            action={checkInAppointment}
                            fields={{ appointment_id: appointment.id }}
                          >
                            Check in
                          </ActionButton>
                          <ActionButton
                            action={cancelAppointment}
                            fields={{ appointment_id: appointment.id }}
                            variant="ghost"
                            confirm="Cancel this appointment?"
                          >
                            Cancel
                          </ActionButton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {session.isManager ? (
          <Card className="lg:sticky lg:top-20 lg:self-start">
            <CardHeader>
              <CardTitle>Book an appointment</CardTitle>
            </CardHeader>
            <CardContent>
              <AppointmentForm customers={customers} techs={techs} defaultDate={selectedDate} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/** Yesterday through the next five days — enough for a front-desk week view. */
function surroundingDays(selected: string) {
  const [year, month, day] = selected.split("-").map(Number);
  const anchor = new Date(year, month - 1, day);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + index - 1);
    return {
      value: toDateInputValue(date),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      day: date.getDate(),
    };
  });
}
