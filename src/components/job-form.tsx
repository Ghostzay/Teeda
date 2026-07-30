"use client";

import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { ClientSearchSelect } from "@/components/clients/ClientSearchSelect";
import { NewClientFields, type NewClientPrefill } from "@/components/clients/new-client-fields";
import { ServicePicker } from "@/components/service-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import { createJob } from "@/lib/actions/jobs";
import { createClient } from "@/lib/supabase/client";
import type { ClientSearchRow, Profile, ServiceMenuItem } from "@/lib/types";

/**
 * Check-in form. Tech defaults to "Next in rotation", so the fair path is the
 * path of least resistance; a manager can override in the same tap.
 */
export function JobForm({
  techs,
  services,
  salonId,
  suggestedTechName,
}: {
  techs: Profile[];
  /** The salon menu. Picking from it sets the price and required skills. */
  services: ServiceMenuItem[];
  salonId: string;
  suggestedTechName: string | null;
}) {
  const [picked, setPicked] = useState<ServiceMenuItem[]>([]);
  const [client, setClient] = useState<ClientSearchRow | null>(null);
  const [prefill, setPrefill] = useState<NewClientPrefill | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  // Bumped on success to remount the picker — it holds its own basket, and a
  // reset form that still shows the last client's three services is worse than
  // no reset at all.
  const [pickerKey, setPickerKey] = useState(0);
  const toast = useToast();

  const needed = [...new Set(picked.flatMap((item) => item.effective_skills))];

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const supabase = createClient();
      // First path segment is the salon id — that is the storage tenant boundary.
      const path = `${salonId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("job-photos").upload(path, file, {
        cacheControl: "3600",
      });

      if (error) throw error;

      const { data } = supabase.storage.from("job-photos").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <ActionForm
      action={createJob}
      className="space-y-4"
      onSuccess={() => {
        setPhotoUrl("");
        setPicked([]);
        setPickerKey((value) => value + 1);
        setClient(null);
        setPrefill(null);
      }}
    >
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

      <div className="space-y-1.5">
        <Label>Services</Label>
        {/* Picking from the menu carries the price and the required skills —
            all of them, so a three-service visit only goes to someone who can
            do all three. */}
        <ServicePicker key={pickerKey} services={services} onChange={setPicked} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="type">Type</Label>
        <Select id="type" name="type" defaultValue="walk-in">
          <option value="walk-in">Walk-in</option>
          <option value="appointment">Appointment</option>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tech_id">Technician</Label>
        <Select id="tech_id" name="tech_id" defaultValue="auto">
          <option value="auto">
            Next in rotation{suggestedTechName ? ` — ${suggestedTechName}` : ""}
          </option>
          <option value="unassigned">Leave open (any tech can claim)</option>
          {techs.map((tech) => {
            // Naming a tech who cannot do the work is a check-in that fails at
            // the desk in front of the client, so say so before they tap it.
            const short = techs.length > 0 && needed.every((skill) => tech.skills.includes(skill));
            return (
              <option key={tech.id} value={tech.id} disabled={!short}>
                {tech.full_name}
                {short ? "" : " — doesn't offer everything picked"}
              </option>
            );
          })}
        </Select>
        <p className="text-xs text-muted-foreground">
          Rotation picks the free tech who has waited longest. Override any time.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" placeholder="Allergies, color, preferences…" rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="photo">Reference photo</Label>
        <input type="hidden" name="photo_url" value={photoUrl} />
        {photoUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Reference" className="size-16 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => setPhotoUrl("")}
              className="text-xs font-medium text-destructive"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input px-3 text-sm text-muted-foreground">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {uploading ? "Uploading…" : "Add a photo"}
            <input
              id="photo"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handlePhoto}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      <SubmitButton size="lg" className="w-full" disabled={uploading}>
        Check in walk-in
      </SubmitButton>
    </ActionForm>
  );
}
