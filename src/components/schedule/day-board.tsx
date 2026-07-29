"use client";

import { useState } from "react";
import { CalendarClock, Footprints, UserCheck } from "lucide-react";

import { AppointmentSheet, type SheetAppointment } from "@/components/appointment-sheet";
import { ScheduleBoard } from "@/components/schedule/schedule-board";
import { Stagger, StaggerItem, Pressable } from "@/components/motion";
import { formatTime } from "@/lib/format";
import type {
  Customer,
  Profile,
  ScheduleItem,
  Service,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const LAYER_ICON = {
  shift: UserCheck,
  appointment: CalendarClock,
  walkin: Footprints,
} as const;

/**
 * The master calendar: the grid, plus everything on it as one list.
 *
 * The grid answers "is this tech free at 2pm?" and the agenda answers "what is
 * happening today?" — and until unassigned bookings were fixed, the second
 * question had no answer at all, because a booking with no tech had no column
 * to appear in.
 *
 * Tapping a booking in either place opens the same sheet, so there is one way
 * to change a booking rather than one per screen.
 */
export function DayBoard({
  view,
  date,
  dateStr,
  techs,
  items,
  openHour,
  closeHour,
  currentUserId,
  canManageFloor,
  weekDays,
  customers,
  fullTechs,
  services,
}: {
  view: "day" | "week";
  date: Date;
  dateStr: string;
  techs: Pick<Profile, "id" | "full_name">[];
  items: ScheduleItem[];
  openHour: number;
  closeHour: number;
  currentUserId: string;
  canManageFloor: boolean;
  weekDays?: { value: string; label: string; date: Date }[];
  customers: Pick<Customer, "id" | "name" | "phone">[];
  fullTechs: Profile[];
  services: Service[];
}) {
  const [open, setOpen] = useState<SheetAppointment | null>(null);

  const openAppointment = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    // The overlay carries what the grid needs to draw; the sheet fills in the
    // rest from its own props once it opens.
    setOpen({
      id: item.id,
      scheduled_at: item.starts_at,
      service_name: (item.title ?? "").split(" · ").slice(1).join(" · ") || "Service",
      service_id: null,
      status: item.status ?? "scheduled",
      notes: null,
      customer_id: null,
      customer_name: (item.title ?? "Client").split(" · ")[0],
      customer_phone: null,
      tech_id: item.tech_id,
      tech_name: item.tech_id ? item.tech_name : null,
    });
  };

  const bookings = items
    .filter((item) => item.layer !== "shift")
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  return (
    <div className="space-y-5">
      <ScheduleBoard
        view={view}
        date={date}
        dateStr={dateStr}
        techs={techs}
        items={items}
        openHour={openHour}
        closeHour={closeHour}
        currentUserId={currentUserId}
        canManageFloor={canManageFloor}
        weekDays={weekDays}
        onOpenAppointment={openAppointment}
      />

      <section aria-label="Everything booked" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title">Everything booked</h2>
          <span className="text-meta text-muted-text tabular-nums">{bookings.length}</span>
        </div>

        {bookings.length === 0 ? (
          <p className="rounded-2xl border border-subtle bg-surface-raised px-4 py-6 text-center text-sm text-muted-text">
            Nothing booked and nobody checked in for this day.
          </p>
        ) : (
          <Stagger className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
            {bookings.map((item) => {
              const Icon = LAYER_ICON[item.layer as keyof typeof LAYER_ICON] ?? CalendarClock;
              const isBooking = item.layer === "appointment";
              return (
                <StaggerItem key={`${item.layer}-${item.id}`}>
                  <Pressable
                    onClick={() => (isBooking && canManageFloor ? openAppointment(item.id) : undefined)}
                    disabled={!isBooking || !canManageFloor}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      isBooking && canManageFloor
                        ? "hover:bg-surface-overlay"
                        : "cursor-default",
                    )}
                  >
                    <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">
                      {formatTime(item.starts_at)}
                    </span>
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isBooking ? "text-info" : "text-warning",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">
                        {item.title ?? "Booking"}
                      </span>
                      <span className="block truncate text-meta text-muted-text">
                        {item.tech_id ? item.tech_name : "Nobody assigned"}
                        {item.status ? ` · ${item.status.replace("_", " ")}` : ""}
                      </span>
                    </span>
                    {!item.tech_id ? (
                      <span className="shrink-0 rounded-full bg-warning-bg px-2 py-0.5 text-meta font-semibold text-warning">
                        No tech
                      </span>
                    ) : null}
                  </Pressable>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </section>

      <AppointmentSheet
        appointment={open}
        customers={customers}
        techs={fullTechs}
        services={services}
        canManageFloor={canManageFloor}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
