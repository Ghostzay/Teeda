"use client";

import { useState } from "react";
import { ImagePlus, Loader2, UserPlus, X } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import { createJob } from "@/lib/actions/jobs";
import { createClient } from "@/lib/supabase/client";
import { COMMON_SERVICES, type Customer, type Profile } from "@/lib/types";

/**
 * Check-in form. Tech defaults to "Next in rotation", so the fair path is the
 * path of least resistance; a manager can override in the same tap.
 */
export function JobForm({
  customers,
  techs,
  salonId,
  suggestedTechName,
  isManager,
}: {
  customers: Pick<Customer, "id" | "name" | "phone">[];
  techs: Profile[];
  salonId: string;
  suggestedTechName: string | null;
  isManager: boolean;
}) {
  const [isNewCustomer, setIsNewCustomer] = useState(customers.length === 0);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

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
        setIsNewCustomer(customers.length === 0);
      }}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="customer">Client</Label>
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
            <Input name="new_customer_name" placeholder="Client name" autoComplete="off" required />
            <Input
              name="new_customer_phone"
              type="tel"
              placeholder="Phone (optional)"
              autoComplete="off"
            />
          </div>
        ) : (
          <Select id="customer" name="customer_id" required defaultValue="">
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
          <Label htmlFor="service_name">Service</Label>
          <Input
            id="service_name"
            name="service_name"
            list="service-options"
            placeholder="Gel manicure"
            required
          />
          <datalist id="service-options">
            {COMMON_SERVICES.map((service) => (
              <option key={service} value={service} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <Select id="type" name="type" defaultValue="walk-in">
            <option value="walk-in">Walk-in</option>
            <option value="appointment">Appointment</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tech_id">Technician</Label>
        <Select id="tech_id" name="tech_id" defaultValue="auto" disabled={!isManager}>
          <option value="auto">
            Next in rotation{suggestedTechName ? ` — ${suggestedTechName}` : ""}
          </option>
          <option value="unassigned">Leave open (any tech can claim)</option>
          {techs.map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.full_name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          {isManager
            ? "Rotation picks the free tech who has waited longest. Override any time."
            : "The rotation assigns this client automatically."}
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
        Check in client
      </SubmitButton>
    </ActionForm>
  );
}
