"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Receipt, X } from "lucide-react";

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
import {
  PAYMENT_METHOD_LABEL,
  type CartLine,
  type JobWithRelations,
  type Profile,
  type Service,
} from "@/lib/types";

const TIP_PRESETS = [0.15, 0.18, 0.2, 0.25];

/**
 * Checkout. The desk picks services off the menu, adds a tip, and the client
 * is closed out in one step — that's how it happens at the counter.
 *
 * The split shown here is the salon's configured rate; it's stored on the
 * payment so later rate changes never rewrite what someone already earned.
 */
export function PaymentDialog({
  job,
  techs,
  services,
  splitPercent,
  variant = "default",
}: {
  job: JobWithRelations;
  techs: Profile[];
  services: Service[];
  splitPercent: number;
  variant?: "default" | "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);

  // Seed from what's already recorded, else the job's booked service.
  const [lines, setLines] = useState<CartLine[]>(() => {
    if (job.services.length > 0) {
      return job.services.map((line) => ({
        service_id: line.service_id,
        name: line.name,
        price: Number(line.price),
        quantity: line.quantity,
      }));
    }
    const booked = services.find((service) => service.id === job.service_id);
    if (booked) {
      return [{ service_id: booked.id, name: booked.name, price: Number(booked.price), quantity: 1 }];
    }
    return [];
  });

  const [tip, setTip] = useState(job.payment ? String(job.payment.tip_amount) : "");

  const serviceTotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [lines],
  );
  const tipValue = Number(tip.replace(/[^0-9.]/g, "")) || 0;
  const techTake = Math.round((serviceTotal * splitPercent) / 100 * 100) / 100 + tipValue;
  const isEdit = Boolean(job.payment);

  const addService = (serviceId: string) => {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return;

    setLines((current) => {
      const existing = current.findIndex((line) => line.service_id === service.id);
      if (existing >= 0) {
        const next = [...current];
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
        return next;
      }
      return [
        ...current,
        { service_id: service.id, name: service.name, price: Number(service.price), quantity: 1 },
      ];
    });
  };

  const changeQuantity = (index: number, delta: number) =>
    setLines((current) =>
      current
        .map((line, i) => (i === index ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    );

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
            {job.customer?.name ?? "Client"}
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
          <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          {/* Fallback when the menu is empty and nothing was rung up. */}
          <input type="hidden" name="service_amount" value={serviceTotal.toFixed(2)} />

          <div className="space-y-1.5">
            <Label htmlFor={`add-${job.id}`}>Add a service</Label>
            <Select
              id={`add-${job.id}`}
              value=""
              onChange={(event) => {
                addService(event.target.value);
                event.currentTarget.value = "";
              }}
            >
              <option value="">Choose from the menu…</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} — {formatMoney(service.price)}
                </option>
              ))}
            </Select>
          </div>

          {lines.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {lines.map((line, index) => (
                <li key={`${line.service_id ?? line.name}-${index}`} className="flex items-center gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{formatMoney(line.price)} each</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => changeQuantity(index, -1)}
                      aria-label={`One less ${line.name}`}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => changeQuantity(index, 1)}
                      aria-label={`One more ${line.name}`}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatMoney(line.price * line.quantity)}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove ${line.name}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-input px-3 py-4 text-center text-sm text-muted-foreground">
              No services added yet.
            </p>
          )}

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

          {serviceTotal > 0 ? (
            <div className="flex flex-wrap gap-2">
              {TIP_PRESETS.map((rate) => {
                const amount = Math.round(serviceTotal * rate * 100) / 100;
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
                    {Math.round(rate * 100)}%
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
              <Select id={`method-${job.id}`} name="method" defaultValue={job.payment?.method ?? "cash"}>
                {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`tiptech-${job.id}`}>Goes to</Label>
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

          <div className="space-y-1 rounded-lg bg-muted px-4 py-3 text-sm">
            <Row label="Services" value={formatMoney(serviceTotal)} />
            <Row label="Tip" value={formatMoney(tipValue)} />
            <div className="my-1 border-t border-border" />
            <Row label="Total" value={formatMoney(serviceTotal + tipValue)} strong />
            <Row
              label={`Tech takes (${splitPercent}% + tip)`}
              value={formatMoney(techTake)}
              muted
            />
            <Row
              label="Salon keeps"
              value={formatMoney(serviceTotal + tipValue - techTake)}
              muted
            />
          </div>

          <SubmitButton size="lg" className="w-full">
            {isEdit ? "Save payment" : "Record payment & finish"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn(muted ? "text-xs text-muted-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-lg font-semibold" : muted ? "text-xs text-muted-foreground" : "font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}
