import { CalendarDays, Phone, StickyNote } from "lucide-react";

import { AppointmentStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPhone, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppointmentWithRelations } from "@/lib/types";

/**
 * A tech's own book for today and tomorrow — a simple agenda rather than a
 * grid, because the only question on the floor is "who's next and when".
 */
export function TechAppointments({
  today,
  tomorrow,
}: {
  today: AppointmentWithRelations[];
  tomorrow: AppointmentWithRelations[];
}) {
  const total = today.length + tomorrow.length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          My appointments
        </CardTitle>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{total}</span>
      </CardHeader>

      <CardContent className="p-0">
        {total === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing booked with you"
            description="Today and tomorrow are clear."
            className="py-8"
          />
        ) : (
          <div>
            <DaySection label="Today" appointments={today} emptyText="Nothing booked today." />
            <DaySection label="Tomorrow" appointments={tomorrow} emptyText="Nothing booked tomorrow." />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DaySection({
  label,
  appointments,
  emptyText,
}: {
  label: string;
  appointments: AppointmentWithRelations[];
  emptyText: string;
}) {
  return (
    <section>
      <h3 className="sticky top-14 z-10 border-y border-border bg-muted px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>

      {appointments.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {appointments.map((appointment) => (
            <li key={appointment.id} className="flex items-start gap-3 px-4 py-3">
              <div
                className={cn(
                  "w-16 shrink-0 rounded-lg px-2 py-1 text-center",
                  appointment.status === "checked_in" ? "bg-progress-bg" : "bg-muted",
                )}
              >
                <p className="text-sm font-semibold leading-tight tabular-nums">
                  {formatTime(appointment.scheduled_at)}
                </p>
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{appointment.customer?.name ?? "Client"}</p>
                  <AppointmentStatusBadge status={appointment.status} />
                </div>
                <p className="truncate text-sm text-muted-foreground">{appointment.service_name}</p>

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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
