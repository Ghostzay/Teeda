"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";

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
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { recordPayment } from "@/lib/actions/payments";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL, type JobWithRelations, type Profile } from "@/lib/types";

const TIP_PRESETS = [0.15, 0.18, 0.2, 0.25];

/**
 * Takes payment and closes the client out in one step — the desk does both in
 * the same motion at the counter, so the app shouldn't make it two.
 */
export function PaymentDialog({
  job,
  techs,
  variant = "default",
}: {
  job: JobWithRelations;
  techs: Profile[];
  variant?: "default" | "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [service, setService] = useState(job.payment ? String(job.payment.service_amount) : "");
  const [tip, setTip] = useState(job.payment ? String(job.payment.tip_amount) : "");

  const serviceValue = Number(service.replace(/[^0-9.]/g, "")) || 0;
  const tipValue = Number(tip.replace(/[^0-9.]/g, "")) || 0;
  const isEdit = Boolean(job.payment);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="lg" className="flex-1">
          <Receipt className="size-4" />
          {isEdit ? "Edit payment" : "Take payment"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Correct payment" : "Take payment"}</DialogTitle>
          <DialogDescription>
            {job.customer?.name ?? "Client"} · {job.service_name}
            {job.status !== "completed" ? " — this also finishes the job." : ""}
          </DialogDescription>
        </DialogHeader>

        <ActionForm
          action={recordPayment}
          resetOnSuccess={false}
          onSuccess={() => setOpen(false)}
          className="space-y-4"
        >
          <input type="hidden" name="job_id" value={job.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`service-${job.id}`}>Service amount</Label>
              <Input
                id={`service-${job.id}`}
                name="service_amount"
                inputMode="decimal"
                placeholder="65.00"
                value={service}
                onChange={(event) => setService(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tip-${job.id}`}>Tip</Label>
              <Input
                id={`tip-${job.id}`}
                name="tip_amount"
                inputMode="decimal"
                placeholder="0.00"
                value={tip}
                onChange={(event) => setTip(event.target.value)}
              />
            </div>
          </div>

          {/* Tip presets — faster than arithmetic at a busy counter. */}
          {serviceValue > 0 ? (
            <div className="flex flex-wrap gap-2">
              {TIP_PRESETS.map((rate) => {
                const amount = Math.round(serviceValue * rate * 100) / 100;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setTip(amount.toFixed(2))}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      Math.abs(tipValue - amount) < 0.005
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {Math.round(rate * 100)}% · {formatMoney(amount)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setTip("")}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                No tip
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`method-${job.id}`}>Method</Label>
              <Select
                id={`method-${job.id}`}
                name="method"
                defaultValue={job.payment?.method ?? "cash"}
              >
                {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`tiptech-${job.id}`}>Tip goes to</Label>
              <Select
                id={`tiptech-${job.id}`}
                name="tip_tech_id"
                defaultValue={job.payment?.tech_id ?? "default"}
              >
                <option value="default">{job.tech?.full_name ?? "The assigned tech"}</option>
                {techs.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`note-${job.id}`}>Note</Label>
            <Textarea
              id={`note-${job.id}`}
              name="note"
              rows={2}
              defaultValue={job.payment?.note ?? ""}
              placeholder="Split payment, gift card, discount applied…"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatMoney(serviceValue + tipValue)}
            </span>
          </div>

          <SubmitButton size="lg" className="w-full">
            {isEdit ? "Save payment" : "Record payment & finish"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
