"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, ShieldAlert, Trash2 } from "lucide-react";

import { ActionForm } from "@/components/action-form";
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
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { saveTechProfile } from "@/lib/actions/profiles";
import { deleteTech } from "@/lib/actions/team";
import type { Profile, TechProfile } from "@/lib/types";

export type DeletionCheck = {
  can_delete: boolean;
  completed_jobs: number;
  payments_count: number;
  future_bookings: number;
  reason: string;
};

/**
 * Everything a manager keeps about a team member.
 *
 * Contact details, next of kin, when they started, and notes only the manager
 * sees — the SELECT policy on `tech_profiles` enforces that last part rather
 * than this component hiding a field it was still sent.
 */
export function TechProfileDialog({
  tech,
  profile,
  deletion,
}: {
  tech: Profile;
  profile: TechProfile | null;
  deletion: DeletionCheck | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
        Profile
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmingDelete(false);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tech.full_name}</DialogTitle>
            <DialogDescription>
              Only managers can see or edit this. Notes are never shown to the tech.
            </DialogDescription>
          </DialogHeader>

          <ActionForm
            action={saveTechProfile}
            resetOnSuccess={false}
            onSuccess={() => router.refresh()}
            className="space-y-4"
          >
            <input type="hidden" name="tech_id" value={tech.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="tp_phone" name="phone" label="Phone" defaultValue={profile?.phone} />
              <Field id="tp_email" name="email" label="Email" type="email" defaultValue={profile?.email} />
              <Field
                id="tp_started"
                name="started_on"
                label="Started"
                type="date"
                defaultValue={profile?.started_on}
              />
              <Field
                id="tp_pronouns"
                name="pronouns"
                label="Pronouns"
                defaultValue={profile?.pronouns}
                placeholder="she/her"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tp_spec">Specialties</Label>
              <Input
                id="tp_spec"
                name="specialties"
                defaultValue={profile?.specialties ?? ""}
                placeholder="Acrylic sculpting, nail art"
              />
              <p className="text-meta text-muted-text">Shown beside their name on the Skills tab.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tp_cert">Certifications</Label>
              <Input
                id="tp_cert"
                name="certifications"
                defaultValue={profile?.certifications ?? ""}
                placeholder="CND Master, state licence #"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tp_bio">About</Label>
              <Textarea id="tp_bio" name="bio" rows={2} defaultValue={profile?.bio ?? ""} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="tp_ec"
                name="emergency_contact"
                label="Emergency contact"
                defaultValue={profile?.emergency_contact}
              />
              <Field
                id="tp_ep"
                name="emergency_phone"
                label="Emergency phone"
                defaultValue={profile?.emergency_phone}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tp_notes">Manager notes</Label>
              <Textarea
                id="tp_notes"
                name="manager_notes"
                rows={2}
                defaultValue={profile?.manager_notes ?? ""}
                placeholder="Private — the tech never sees this."
              />
            </div>

            <p className="text-meta text-muted-text">
              Every field is saved together, so clearing a box clears the value.
            </p>

            <SubmitButton className="w-full">Save profile</SubmitButton>
          </ActionForm>

          <div className="space-y-3 border-t border-subtle pt-4">
            {!confirmingDelete ? (
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
                <Trash2 className="size-4" />
                Remove from the team
              </Button>
            ) : (
              <div className="space-y-3 rounded-xl border border-danger-border bg-danger-bg p-3 text-danger">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  <p className="text-sm">{deletion?.reason ?? "Checking…"}</p>
                </div>

                {deletion?.can_delete ? (
                  <ActionForm
                    action={deleteTech}
                    resetOnSuccess={false}
                    onSuccess={() => {
                      setOpen(false);
                      router.refresh();
                    }}
                    className="flex flex-wrap gap-2"
                  >
                    <input type="hidden" name="tech_id" value={tech.id} />
                    <SubmitButton variant="destructive">
                      <Trash2 className="size-4" />
                      Delete {tech.full_name}
                    </SubmitButton>
                    <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                      Keep them
                    </Button>
                  </ActionForm>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                    Close
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
      />
    </div>
  );
}
