"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronDown, Repeat, Trash2 } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { AnimatePresence, motion } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { clearUsualWeek, saveUsualWeek } from "@/lib/actions/availability";
import { WEEKDAYS, type AvailabilityPattern } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TechOption = { id: string; full_name: string };

/** "10:00:00" → "10:00", which is what a time input wants. */
function toTimeInput(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.slice(0, 5);
}

function describe(pattern: AvailabilityPattern): string {
  const days = WEEKDAYS.filter((day) => pattern.weekdays.includes(day.value)).map((d) => d.short);
  return `${days.join(", ")} · ${toTimeInput(pattern.start_time, "")}–${toTimeInput(pattern.end_time, "")}`;
}

/**
 * The usual week.
 *
 * Marking every single day by hand is the chore that gets done in week one and
 * abandoned by week three, and an empty calendar is worse than no calendar —
 * the floor stops trusting it. So the common case is stated once: these days,
 * these hours, until I say otherwise.
 *
 * Collapsed by default. It is a thing you set and forget, not a thing you look
 * at, so it should not compete with the month for attention.
 */
export function UsualWeek({
  patterns,
  techs,
  currentUserId,
  canManageFloor,
}: {
  patterns: AvailabilityPattern[];
  techs: TechOption[];
  currentUserId: string;
  canManageFloor: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [techId, setTechId] = useState(currentUserId);

  const forTech = patterns.find((pattern) => pattern.tech_id === techId) ?? null;
  const mine = patterns.find((pattern) => pattern.tech_id === currentUserId) ?? null;

  const [selected, setSelected] = useState<number[]>(forTech?.weekdays ?? []);
  const [dirtyFor, setDirtyFor] = useState(techId);

  // Switching tech in the picker should load that tech's week, not keep the
  // last one on screen — otherwise you save Mai's days onto Linh.
  if (dirtyFor !== techId) {
    setDirtyFor(techId);
    setSelected(forTech?.weekdays ?? []);
  }

  const toggle = (value: number) =>
    setSelected((current) =>
      current.includes(value) ? current.filter((day) => day !== value) : [...current, value],
    );

  return (
    <section className="overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surface-overlay"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent-default">
          <Repeat className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight">
            {canManageFloor ? "Usual weeks" : "My usual week"}
          </span>
          <span className="block truncate text-sm text-muted-text">
            {mine
              ? describe(mine)
              : canManageFloor && patterns.length > 0
                ? `${patterns.length} set — set them once and the calendar fills itself`
                : "Set it once and the calendar fills itself for a year"}
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-text transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-subtle p-4">
              {/* Everyone else's week, so a manager can see the shape of the rota. */}
              {canManageFloor && patterns.length > 0 ? (
                <ul className="space-y-1">
                  {patterns.map((pattern) => (
                    <li
                      key={pattern.tech_id}
                      className="flex items-center gap-3 rounded-xl border border-subtle bg-surface-sunken px-3 py-2 text-sm"
                    >
                      <CalendarCheck className="size-4 shrink-0 text-accent-default" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {pattern.tech_name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-text">
                        {describe(pattern)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <ActionForm
                action={saveUsualWeek}
                resetOnSuccess={false}
                onSuccess={() => router.refresh()}
                className="space-y-4"
              >
                {canManageFloor ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="uw_tech">Whose week</Label>
                    <Select
                      id="uw_tech"
                      name="tech_id"
                      value={techId}
                      onChange={(event) => setTechId(event.target.value)}
                    >
                      {techs.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.full_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <input type="hidden" name="tech_id" value={currentUserId} />
                )}

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Days normally worked</legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const on = selected.includes(day.value);
                      return (
                        <label
                          key={day.value}
                          className={cn(
                            "flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border px-3.5 text-sm font-semibold transition-colors",
                            on
                              ? "border-accent-default bg-accent-default text-on-accent"
                              : "border-subtle bg-surface-sunken text-secondary-text hover:bg-surface-overlay",
                          )}
                        >
                          <input
                            type="checkbox"
                            name="weekdays"
                            value={day.value}
                            checked={on}
                            onChange={() => toggle(day.value)}
                            className="sr-only"
                          />
                          <span aria-label={day.long}>{day.short}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="uw_from">From</Label>
                    <Input
                      id="uw_from"
                      name="from"
                      type="time"
                      step={900}
                      defaultValue={toTimeInput(forTech?.start_time, "09:00")}
                      key={`uw-from-${techId}`}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="uw_to">To</Label>
                    <Input
                      id="uw_to"
                      name="to"
                      type="time"
                      step={900}
                      defaultValue={toTimeInput(forTech?.end_time, "17:00")}
                      key={`uw-to-${techId}`}
                      required
                    />
                  </div>
                </div>

                <p className="text-meta text-muted-text">
                  Fills the calendar a year ahead. A day you change by hand keeps your change —
                  saving this again never overwrites it.
                </p>

                <div className="flex flex-wrap gap-2">
                  <SubmitButton disabled={selected.length === 0}>Save usual week</SubmitButton>
                </div>
              </ActionForm>

              {forTech ? (
                <ActionForm
                  action={clearUsualWeek}
                  resetOnSuccess={false}
                  onSuccess={() => router.refresh()}
                  className="border-t border-subtle pt-4"
                >
                  <input type="hidden" name="tech_id" value={techId} />
                  <SubmitButton variant="ghost">
                    <Trash2 className="size-4" />
                    Stop the usual week
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
