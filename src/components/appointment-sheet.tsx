"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Phone, StickyNote, UserRound, X } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { ClientSearchSelect } from "@/components/clients/ClientSearchSelect";
import { ServicePicker } from "@/components/service-picker";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { cancelAppointment, checkInAppointment, updateAppointmentAction } from "@/lib/actions/appointments";
import { formatDate, formatPhone, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { AppointmentWithRelations, ClientSearchRow, Profile, ServiceMenuItem } from "@/lib/types";

export type SheetAppointment = {
  id: string;
  scheduled_at: string;
  service_name: string;
  service_id: string | null;
  status: string;
  notes: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  tech_id: string | null;
  tech_name: string | null;
};

/** Narrow a joined appointment row down to what the sheet needs. */
export function toSheetAppointment(appointment: AppointmentWithRelations): SheetAppointment {
  return {
    id: appointment.id,
    scheduled_at: appointment.scheduled_at,
    service_name: appointment.service_name,
    service_id: appointment.service_id,
    status: appointment.status,
    notes: appointment.notes,
    customer_id: appointment.customer_id,
    customer_name: appointment.customer?.name ?? null,
    customer_phone: appointment.customer?.phone ?? null,
    tech_id: appointment.tech_id,
    tech_name: appointment.tech?.full_name ?? null,
  };
}

/** Local date and time inputs from an instant, in the viewer's own clock. */
function splitLocal(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

/**
 * One booking, opened.
 *
 * Everything the front desk knows about it, and — since `update_appointment`
 * exists — everything they can change. Before this there was create and cancel
 * and nothing in between, so fixing a mistyped time meant cancelling and
 * rebooking, which loses the thread for the client.
 *
 * Rendered wherever a booking appears, so "click it to see it" is true
 * everywhere rather than only on the Bookings page.
 */
export function AppointmentSheet({
  appointment,
  techs,
  services,
  canManageFloor,
  onClose,
}: {
  appointment: SheetAppointment | null;
  techs: Profile[];
  services: ServiceMenuItem[];
  canManageFloor: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  /** `null` while it is still being read — an empty array is a real answer. */
  const [basket, setBasket] = useState<string[] | null>(null);
  // The sheet knows who the booking is for; seed the picker from that so the
  // usual edit does not start by making somebody search for a name they can
  // already see at the top of the drawer.
  const [client, setClient] = useState<ClientSearchRow | null>(null);

  const appointmentId = appointment?.id ?? null;

  // Read the basket when the editor opens rather than when the sheet does:
  // most opens are a look, not an edit, and this is a round trip.
  useEffect(() => {
    if (!editing || !appointment) return;
    setClient({
      id: appointment.customer_id ?? "",
      first_name: (appointment.customer_name ?? "").split(" ")[0] || null,
      last_name: (appointment.customer_name ?? "").split(" ").slice(1).join(" ") || null,
      phone_last4: appointment.customer_phone
        ? appointment.customer_phone.replace(/\D/g, "").slice(-4)
        : null,
      last_visit: null,
      usual_tech: null,
      is_active: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, appointmentId]);

  useEffect(() => {
    if (!editing || !appointmentId) return;

    let cancelled = false;
    setBasket(null);

    createClient()
      .rpc("appointment_basket", { p_appointment_id: appointmentId })
      .then(({ data }) => {
        if (cancelled) return;
        setBasket(
          (data ?? [])
            .map((line) => line.service_id)
            .filter((id): id is string => Boolean(id)),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [editing, appointmentId]);

  if (!appointment) return null;

  const { date, time } = splitLocal(appointment.scheduled_at);
  const open = Boolean(appointment);
  const settled = appointment.status === "completed" || appointment.status === "cancelled";

  const close = () => {
    setEditing(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {appointment.customer_name ?? "Client"}
            <AppointmentStatusBadge status={appointment.status as never} />
          </DialogTitle>
          <DialogDescription>
            {formatDate(appointment.scheduled_at)} at {formatTime(appointment.scheduled_at)}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <ActionForm
            action={updateAppointmentAction}
            resetOnSuccess={false}
            onSuccess={() => {
              setEditing(false);
              router.refresh();
            }}
            className="space-y-4"
          >
            <input type="hidden" name="appointment_id" value={appointment.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap_date">Date</Label>
                <Input id="ap_date" name="date" type="date" defaultValue={date} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap_time">Time</Label>
                <Input
                  id="ap_time"
                  name="time"
                  type="time"
                  step={900}
                  defaultValue={time}
                  required
                />
              </div>
            </div>

            {/* Seeded with whoever is on the booking, so the common edit —
                changing the time, not the person — needs no search at all. */}
            <ClientSearchSelect
              value={client}
              onChange={setClient}
              name="customer_id"
              required
            />

            <div className="space-y-1.5">
              <Label>Services</Label>
              {/* Seeded from the saved basket, not from `service_id`: a booking
                  of three services would otherwise reopen showing one, and
                  saving would silently drop the other two. */}
              {basket === null ? (
                <p className="rounded-xl border border-subtle bg-surface-sunken px-3 py-6 text-center text-sm text-muted-text">
                  Loading what was booked…
                </p>
              ) : (
                <ServicePicker services={services} defaultSelected={basket} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap_tech">Technician</Label>
              <Select id="ap_tech" name="tech_id" defaultValue={appointment.tech_id ?? "unassigned"}>
                <option value="unassigned">Nobody yet</option>
                {techs.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap_notes">Notes</Label>
              <Textarea
                id="ap_notes"
                name="notes"
                defaultValue={appointment.notes ?? ""}
                rows={3}
                placeholder="Anything the tech should know."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <SubmitButton className="flex-1">Save changes</SubmitButton>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                <X className="size-4" />
                Cancel
              </Button>
            </div>
          </ActionForm>
        ) : (
          <>
            <dl className="space-y-2.5">
              <Row icon={CalendarClock} label="Service" value={appointment.service_name} />
              <Row
                icon={UserRound}
                label="Technician"
                value={appointment.tech_name ?? "Nobody assigned yet"}
              />
              {appointment.customer_phone ? (
                <div className="flex items-center gap-3">
                  <Phone className="size-4 shrink-0 text-muted-text" />
                  <div className="min-w-0 flex-1">
                    <dt className="text-meta uppercase text-muted-text">Phone</dt>
                    <dd>
                      <a
                        href={`tel:${appointment.customer_phone}`}
                        className="font-medium text-accent-default underline-offset-4 hover:underline"
                      >
                        {formatPhone(appointment.customer_phone)}
                      </a>
                    </dd>
                  </div>
                </div>
              ) : null}
              {appointment.notes ? (
                <Row icon={StickyNote} label="Notes" value={appointment.notes} />
              ) : null}
            </dl>

            {canManageFloor ? (
              <div className="flex flex-wrap gap-2 border-t border-subtle pt-4">
                {!settled ? (
                  <Button onClick={() => setEditing(true)} className="flex-1">
                    <Pencil className="size-4" />
                    Edit booking
                  </Button>
                ) : null}

                {appointment.status === "scheduled" ? (
                  <>
                    <ActionButton
                      action={checkInAppointment}
                      fields={{ appointment_id: appointment.id }}
                      variant="outline"
                    >
                      Check in
                    </ActionButton>
                    <ActionButton
                      action={cancelAppointment}
                      fields={{ appointment_id: appointment.id }}
                      variant="ghost"
                      confirm="Cancel this booking?"
                    >
                      Cancel booking
                    </ActionButton>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="border-t border-subtle pt-4 text-sm text-muted-text">
                Ask the front desk to change a booking.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-text" />
      <div className="min-w-0 flex-1">
        <dt className="text-meta uppercase text-muted-text">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}
