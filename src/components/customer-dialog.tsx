"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { upsertCustomer } from "@/lib/actions/customers";
import type { Customer } from "@/lib/types";

/** Add or edit a client. One dialog serves both — `customer` decides which. */
export function CustomerDialog({ customer }: { customer?: Customer }) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(customer);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${customer?.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="lg">
            <Plus className="size-4" />
            New client
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            Notes stay with the client, so any tech can pick up where the last one left off.
          </DialogDescription>
        </DialogHeader>

        <ActionForm
          action={upsertCustomer}
          resetOnSuccess={!isEdit}
          onSuccess={() => setOpen(false)}
          className="space-y-4"
        >
          {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={customer?.name} required autoComplete="off" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={customer?.phone ?? ""}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={customer?.notes ?? ""}
              placeholder="Prefers Tina · allergic to acetone · likes almond shape"
            />
          </div>

          <SubmitButton size="lg" className="w-full">
            {isEdit ? "Save changes" : "Add client"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
