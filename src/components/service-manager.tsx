"use client";

import { useState } from "react";
import { Pencil, Plus, Scissors } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteService, upsertService } from "@/lib/actions/services";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ALL_SKILLS, SKILL_LABEL, type Service, type Skill } from "@/lib/types";

/** The salon's price list. Managers only. */
export function ServiceManager({ services }: { services: Service[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="size-4 text-primary" />
            Service menu ({services.length})
          </CardTitle>
          <CardDescription>
            Prices appear at checkout, on walk-ins and when booking. Skills decide who the
            rotation can offer the work to.
          </CardDescription>
        </div>
        <ServiceDialog />
      </CardHeader>

      <CardContent className="p-0">
        {services.length === 0 ? (
          <EmptyState
            icon={Scissors}
            title="No services yet"
            description="Add your first service to start using the price list."
          />
        ) : (
          <ul className="divide-y divide-border">
            {services.map((service) => (
              <li key={service.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{service.name}</p>
                    {!service.is_active ? <Badge variant="cancelled">Hidden</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {service.duration_minutes ? `${service.duration_minutes} min · ` : ""}
                    {service.required_skills.length > 0
                      ? service.required_skills.map((skill) => SKILL_LABEL[skill]).join(" · ")
                      : "Any tech"}
                  </p>
                </div>

                <span className="shrink-0 text-base font-semibold tabular-nums">
                  {formatMoney(service.price)}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  <ServiceDialog service={service} />
                  <ActionButton
                    action={deleteService}
                    fields={{ id: service.id }}
                    variant="ghost"
                    size="icon"
                    confirm={`Remove ${service.name} from the menu? Past jobs keep their recorded price.`}
                  >
                    <span aria-hidden>×</span>
                    <span className="sr-only">Delete {service.name}</span>
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceDialog({ service }: { service?: Service }) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[]>(service?.required_skills ?? []);
  const isEdit = Boolean(service);

  const toggle = (skill: Skill) =>
    setSkills((current) =>
      current.includes(skill) ? current.filter((value) => value !== skill) : [...current, skill],
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSkills(service?.required_skills ?? []);
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${service?.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="lg">
            <Plus className="size-4" />
            Add service
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit service" : "New service"}</DialogTitle>
          <DialogDescription>
            Skills are what a tech must offer for the rotation to hand them this work.
          </DialogDescription>
        </DialogHeader>

        <ActionForm
          action={upsertService}
          resetOnSuccess={!isEdit}
          onSuccess={() => setOpen(false)}
          className="space-y-4"
        >
          {service ? <input type="hidden" name="id" value={service.id} /> : null}
          {skills.map((skill) => (
            <input key={skill} type="hidden" name="required_skills" value={skill} />
          ))}

          <div className="space-y-1.5">
            <Label htmlFor={`name-${service?.id ?? "new"}`}>Name</Label>
            <Input
              id={`name-${service?.id ?? "new"}`}
              name="name"
              defaultValue={service?.name}
              placeholder="Gel manicure"
              required
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`price-${service?.id ?? "new"}`}>Price</Label>
              <Input
                id={`price-${service?.id ?? "new"}`}
                name="price"
                inputMode="decimal"
                defaultValue={service ? String(service.price) : ""}
                placeholder="40.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`duration-${service?.id ?? "new"}`}>Minutes</Label>
              <Input
                id={`duration-${service?.id ?? "new"}`}
                name="duration_minutes"
                inputMode="numeric"
                defaultValue={service?.duration_minutes ?? ""}
                placeholder="45"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Required skills</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_SKILLS.map((skill) => {
                const isOn = skills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggle(skill)}
                    aria-pressed={isOn}
                    className={cn(
                      "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      isOn
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {SKILL_LABEL[skill]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty if any tech can do it.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`active-${service?.id ?? "new"}`}
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={service?.is_active ?? true}
              className="size-4"
            />
            <Label htmlFor={`active-${service?.id ?? "new"}`}>Show on the menu</Label>
            {/* Unchecked checkboxes submit nothing, so pair with an explicit false. */}
            <input type="hidden" name="is_active" value="false" />
          </div>

          <SubmitButton size="lg" className="w-full">
            {isEdit ? "Save service" : "Add to menu"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
