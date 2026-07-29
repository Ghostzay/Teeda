"use client";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { saveCustomerDetails } from "@/lib/actions/profiles";
import type { Customer, Profile } from "@/lib/types";

/** The fields the client dialog doesn't cover, edited from their profile. */
export function ClientDetailsForm({
  customer,
  techs,
}: {
  customer: Customer;
  techs: Profile[];
}) {
  return (
    <ActionForm action={saveCustomerDetails} resetOnSuccess={false} className="space-y-4">
      <input type="hidden" name="customer_id" value={customer.id} />

      <div className="space-y-1.5">
        <Label htmlFor="cd_email">Email</Label>
        <Input id="cd_email" name="email" type="email" defaultValue={customer.email ?? ""} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cd_birthday">Birthday</Label>
        <Input id="cd_birthday" name="birthday" type="date" defaultValue={customer.birthday ?? ""} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cd_pref">Asks for</Label>
        <Select
          id="cd_pref"
          name="preferred_tech_id"
          defaultValue={customer.preferred_tech_id ?? "none"}
        >
          <option value="none">No preference</option>
          {techs.map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.full_name}
            </option>
          ))}
        </Select>
        <p className="text-meta text-muted-text">
          A preference, not a rule — the rotation still decides who is free.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cd_allergies">Allergies and sensitivities</Label>
        <Textarea
          id="cd_allergies"
          name="allergies"
          rows={2}
          defaultValue={customer.allergies ?? ""}
          placeholder="Acetone sensitivity, latex allergy…"
        />
        <p className="text-meta text-muted-text">Shown at the top of their profile in red.</p>
      </div>

      <SubmitButton className="w-full">Save details</SubmitButton>
    </ActionForm>
  );
}
