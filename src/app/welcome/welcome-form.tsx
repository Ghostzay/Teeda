"use client";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { bootstrapSalon } from "@/lib/actions/onboarding";

export function WelcomeForm({
  defaultSalonName,
  defaultFullName,
}: {
  defaultSalonName: string;
  defaultFullName: string;
}) {
  return (
    <ActionForm action={bootstrapSalon} resetOnSuccess={false} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="salon_name">Salon name</Label>
        <Input
          id="salon_name"
          name="salon_name"
          defaultValue={defaultSalonName}
          placeholder="Polished Nail Bar"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full_name">Your name</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={defaultFullName}
          placeholder="Alex Tran"
        />
      </div>

      <SubmitButton size="lg" className="w-full">
        Open my console
      </SubmitButton>
    </ActionForm>
  );
}
