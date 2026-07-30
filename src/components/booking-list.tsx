"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Phone, StickyNote } from "lucide-react";

import {
  AppointmentSheet,
  toSheetAppointment,
  type SheetAppointment,
} from "@/components/appointment-sheet";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { Pressable, Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { formatPhone, formatTime, toDateInputValue } from "@/lib/format";
import type { AppointmentWithRelations, Profile, ServiceMenuItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function shiftDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateInputValue(new Date(y, m - 1, d + delta));
}

/**
 * The day strip.
 *
 * It used to show yesterday plus the next five days, full stop — there was no
 * way to reach last week at all, so "what did we do on Saturday?" was
 * unanswerable from this screen. Now it is a fortnight-wide window you can page
 * backwards and forwards through, with a date field for anything further out.
 */
function DayStrip({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (day: string) => void;
}) {
  // Centred on the selection: a week back, a week forward.
  const days = Array.from({ length: 15 }, (_, i) => {
    const value = shiftDays(selected, i - 7);
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return {
      value,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      day: date.getDate(),
      isToday: value === toDateInputValue(),
    };
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => onPick(shiftDays(selected, -7))}>
          <ChevronLeft className="size-4" />
          <span className="sr-only">Previous week</span>
        </Button>

        <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
          {days.map((day) => (
            <Pressable
              key={day.value}
              onClick={() => onPick(day.value)}
              aria-current={day.value === selected ? "date" : undefined}
              className={cn(
                "flex min-h-[3.25rem] min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-xl border px-3 transition-colors",
                day.value === selected
                  ? "border-transparent bg-accent-default text-on-accent"
                  : day.isToday
                    ? "border-accent-default bg-surface-raised text-primary-text"
                    : "border-subtle bg-surface-raised text-secondary-text hover:bg-surface-overlay",
              )}
            >
              <span className="text-meta font-semibold uppercase">{day.weekday}</span>
              <span className="text-base font-semibold leading-tight tabular-nums">{day.day}</span>
            </Pressable>
          ))}
        </div>

        <Button variant="outline" size="icon" onClick={() => onPick(shiftDays(selected, 7))}>
          <ChevronRight className="size-4" />
          <span className="sr-only">Next week</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={selected}
          onChange={(event) => event.target.value && onPick(event.target.value)}
          className="w-auto"
          aria-label="Jump to a date"
        />
        <Button variant="ghost" size="sm" onClick={() => onPick(toDateInputValue())}>
          Today
        </Button>
      </div>
    </div>
  );
}

/**
 * Bookings for one day, each one openable.
 *
 * The whole row is the target rather than a small "edit" link — on a tablet
 * that is the difference between a hit and three attempts.
 */
export function BookingList({
  selectedDate,
  appointments,
  techs,
  services,
  canManageFloor,
}: {
  selectedDate: string;
  appointments: AppointmentWithRelations[];
  techs: Profile[];
  services: ServiceMenuItem[];
  canManageFloor: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<SheetAppointment | null>(null);

  return (
    <div className="space-y-4">
      <DayStrip
        selected={selectedDate}
        onPick={(day) => router.push(`/appointments?date=${day}`)}
      />

      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
        <header className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3">
          <h2 className="text-title">
            {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h2>
          <span className="text-sm font-medium tabular-nums text-muted-text">
            {appointments.length} {appointments.length === 1 ? "booking" : "bookings"}
          </span>
        </header>

        {appointments.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing booked this day"
            description="Use the form to add one, or pick another date above."
          />
        ) : (
          <Stagger className="divide-y divide-subtle">
            {appointments.map((appointment) => (
              <StaggerItem key={appointment.id}>
                <Pressable
                  onClick={() => setOpen(toSheetAppointment(appointment))}
                  className="flex w-full flex-col gap-3 px-4 py-3 transition-colors hover:bg-surface-overlay sm:flex-row sm:items-center"
                >
                  <span className="w-20 shrink-0 text-lg font-semibold leading-tight tabular-nums">
                    {formatTime(appointment.scheduled_at)}
                  </span>

                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">
                        {appointment.customer?.name ?? "Client"}
                      </span>
                      <AppointmentStatusBadge status={appointment.status} />
                      {appointment.tech_id === null ? (
                        <span className="rounded-full bg-warning-bg px-2 py-0.5 text-meta font-semibold text-warning">
                          No tech
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-sm text-secondary-text">
                      {appointment.service_name} ·{" "}
                      {appointment.tech?.full_name ?? "nobody assigned"}
                    </span>
                    {appointment.customer?.phone ? (
                      <span className="flex items-center gap-1 text-meta text-muted-text">
                        <Phone className="size-3" />
                        {formatPhone(appointment.customer.phone)}
                      </span>
                    ) : null}
                    {appointment.notes ? (
                      <span className="flex items-start gap-1 text-meta text-muted-text">
                        <StickyNote className="mt-0.5 size-3 shrink-0" />
                        <span className="truncate">{appointment.notes}</span>
                      </span>
                    ) : null}
                  </span>

                  <span className="shrink-0 text-meta text-muted-text">Tap to open</span>
                </Pressable>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>

      <AppointmentSheet
        appointment={open}
        techs={techs}
        services={services}
        canManageFloor={canManageFloor}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
