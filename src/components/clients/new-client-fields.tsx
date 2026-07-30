"use client";

import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type NewClientPrefill = { name?: string; phone?: string };

/**
 * Register a client inline, prefilled with whatever the search was given.
 *
 * Reachable only from a search that found nobody. That ordering is the whole
 * point: the old "New client" toggle sat beside the picker and could be tapped
 * without searching at all, which is how a salon ends up with three records
 * for the same person.
 *
 * Submits `new_customer_name` / `new_customer_phone` — the shape the booking
 * and check-in actions already accept, so nothing server-side changed.
 */
export function NewClientFields({
  prefill,
  onCancel,
}: {
  prefill: NewClientPrefill;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-accent-border bg-accent-subtle/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">New client</p>
        <button
          type="button"
          onClick={onCancel}
          className="flex size-11 items-center justify-center rounded-lg text-muted-text hover:text-primary-text"
          aria-label="Cancel adding a new client"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new_customer_name">Name</Label>
          <Input
            id="new_customer_name"
            name="new_customer_name"
            defaultValue={prefill.name ?? ""}
            placeholder="Client name"
            autoComplete="off"
            autoFocus={!prefill.name}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new_customer_phone">Phone</Label>
          <Input
            id="new_customer_phone"
            name="new_customer_phone"
            type="tel"
            defaultValue={prefill.phone ?? ""}
            placeholder="Optional"
            autoComplete="off"
            autoFocus={Boolean(prefill.name)}
          />
        </div>
      </div>
    </div>
  );
}
