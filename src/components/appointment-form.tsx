"use client";

import { useState } from "react";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ClientSearchSelect } from "@/components/clients/ClientSearchSelect";
import { NewClientFields, type NewClientPrefill } from "@/components/clients/new-client-fields";
import { ServicePicker } from "@/components/service-picker";
import { createAppointment } from "@/lib/actions/appointments";
import type { ClientSearchRow, Profile, ServiceMenuItem } from "@/lib/types";

export function AppointmentForm({
  techs,
  services,
  defaultDate,
  defaultTime,
  defaultTechId,
}: {
  techs: Profile[];
  /** The salon menu — booking off it carries price and required skills. */
  services: ServiceMenuItem[];
  defaultDate: string;
  /** Set when the desk tapped open time on the day calendar. */
  defaultTime?: string;
  defaultTechId?: string;
}) {
  const [client, setClient] = useState<ClientSearchRow | null>(null);
  const [prefill, setPrefill] = useState<NewClientPrefill | null>(null);
  const [picked, setPicked] = useState<ServiceMenuItem[]>([]);
  // The picker owns its basket, so a reset needs a remount, not a state poke.
  const [pickerKey, setPickerKey] = useState(0);

  const needed = [...new Set(picked.flatMap((item) => item.effective_skills))];

  return (
    <ActionForm
      action={createAppointment}
      className="space-y-4"
      onSuccess={() => {
        setClient(null);
        setPrefill(null);
        setPicked([]);
        setPickerKey((value) => value + 1);
      }}
    >
      {/* One search, server-side. The old prefetched <select> shipped every
          client to the browser; "New client" now lives behind a search that
          found nobody, which is also the duplicate check. */}
      <ClientSearchSelect
        value={client}
        onChange={setClient}
        name="customer_id"
        required
        onAddNew={setPrefill}
      />
      {prefill ? (
        <NewClientFields prefill={prefill} onCancel={() => setPrefill(null)} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="scheduled_date">Date</Label>
          <Input id="scheduled_date" name="scheduled_date" type="date" defaultValue={defaultDate} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scheduled_time">Time</Label>
          <Input id="scheduled_time" name="scheduled_time" type="time" defaultValue={defaultTime ?? "10:00"} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Services</Label>
        <ServicePicker key={pickerKey} services={services} onChange={setPicked} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt_tech">Requested tech</Label>
        <Select id="appt_tech" name="tech_id" defaultValue={defaultTechId ?? "any"}>
          <option value="any">No preference — rotation decides at check-in</option>
          {techs.map((tech) => {
            // A booking onto someone who can't do the work fails at check-in,
            // a week later, with the client already in the chair.
            const qualified = needed.every((skill) => tech.skills.includes(skill));
            return (
              <option key={tech.id} value={tech.id} disabled={!qualified}>
                {tech.full_name}
                {qualified ? "" : " — doesn't offer everything picked"}
              </option>
            );
          })}
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
