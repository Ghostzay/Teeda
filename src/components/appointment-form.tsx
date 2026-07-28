"use client";

import { useState } from "react";
import { UserPlus, X } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { createAppointment } from "@/lib/actions/appointments";
import { formatMoney } from "@/lib/format";
import { COMMON_SERVICES, type Customer, type Profile, type Service } from "@/lib/types";

export function AppointmentForm({
  customers,
  techs,
  services,
  defaultDate,
}: {
  customers: Pick<Customer, "id" | "name" | "phone">[];
  techs: Profile[];
  /** The salon menu — booking off it carries price and required skills. */
  services: Service[];
  defaultDate: string;
}) {
  const [isNewCustomer, setIsNewCustomer] = useState(customers.length === 0);
  const [serviceName, setServiceName] = useState("");

  return (
    <ActionForm
      action={createAppointment}
      className="space-y-4"
      onSuccess={() => {
        setIsNewCustomer(customers.length === 0);
        setServiceName("");
      }}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="appt_customer">Client</Label>
          <button
            type="button"
            onClick={() => setIsNewCustomer((value) => !value)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            {isNewCustomer ? (
              <>
                <X className="size-3" /> Pick existing
              </>
            ) : (
              <>
                <UserPlus className="size-3" /> New client
              </>
            )}
          </button>
        </div>

        {isNewCustomer ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input name="new_customer_name" placeholder="Client name" required autoComplete="off" />
            <Input name="new_customer_phone" type="tel" placeholder="Phone (optional)" autoComplete="off" />
          </div>
        ) : (
          <Select id="appt_customer" name="customer_id" required defaultValue="">
            <option value="" disabled>
              Select a client…
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="scheduled_date">Date</Label>
          <Input id="scheduled_date" name="scheduled_date" type="date" defaultValue={defaultDate} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scheduled_time">Time</Label>
          <Input id="scheduled_time" name="scheduled_time" type="time" defaultValue="10:00" required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt_service">Service</Label>
        {services.length > 0 ? (
          <>
            <Select
              id="appt_service"
              name="service_id"
              defaultValue=""
              onChange={(event) => {
                const picked = services.find((item) => item.id === event.target.value);
                setServiceName(picked ? picked.name : "");
              }}
            >
              <option value="">Off-menu / custom…</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} — {formatMoney(service.price)}
                  {service.duration_minutes ? ` · ${service.duration_minutes} min` : ""}
                </option>
              ))}
            </Select>
            <Input
              name="service_name"
              value={serviceName}
              onChange={(event) => setServiceName(event.target.value)}
              placeholder="Or type a service"
              required
            />
          </>
        ) : (
          <>
            <Input
              id="appt_service"
              name="service_name"
              list="appointment-services"
              placeholder="Full set acrylic"
              required
            />
            <datalist id="appointment-services">
              {COMMON_SERVICES.map((service) => (
                <option key={service} value={service} />
              ))}
            </datalist>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt_tech">Requested tech</Label>
        <Select id="appt_tech" name="tech_id" defaultValue="any">
          <option value="any">No preference — rotation decides at check-in</option>
          {techs.map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.full_name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt_notes">Notes</Label>
        <Textarea id="appt_notes" name="notes" rows={2} placeholder="Bringing a photo, wants ombré…" />
      </div>

      <SubmitButton size="lg" className="w-full">
        Book appointment
      </SubmitButton>
    </ActionForm>
  );
}
