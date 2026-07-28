"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Coffee, Plane, Trash2, UserCheck } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Pressable, Stagger, StaggerItem, motion } from "@/components/motion";
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
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { clearDayAvailability, setDayAvailability } from "@/lib/actions/availability";
import { initials } from "@/lib/format";
import type { DayAvailability, ShiftKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_META: Record<ShiftKind, { label: string; icon: typeof UserCheck; chip: string }> = {
  shift: { label: "Working", icon: UserCheck, chip: "bg-accent-subtle text-accent-default" },
  break: { label: "Break", icon: Coffee, chip: "bg-info-bg text-info" },
  time_off: { label: "Out of office", icon: Plane, chip: "bg-warning-bg text-warning" },
};

export type TechOption = { id: string; full_name: string };

/** yyyy-mm-dd for a local calendar date, without going through UTC. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The 6x7 grid a month is drawn on, Monday-first. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  // getDay() is Sunday-first; shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * The month.
 *
 * This screen answers "who is in on the 14th?" — not "how many hours did
 * anyone work". Each square shows who has marked themselves in, and how much
 * is already booked against them; tapping one opens that day to edit or to
 * jump into the hour-by-hour grid.
 *
 * Highlighting one tech dims the rest, which is the fastest way to read a
 * single person's month out of a grid this dense.
 */
export function MonthView({
  anchor,
  days,
  techs,
  currentUserId,
  canManageFloor,
  onOpenDay,
}: {
  /** Any date inside the month being drawn. */
  anchor: Date;
  days: DayAvailability[];
  techs: TechOption[];
  currentUserId: string;
  canManageFloor: boolean;
  /** Jump to the hour-by-hour grid for a date. */
  onOpenDay: (day: string) => void;
}) {
  const router = useRouter();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const byDay = useMemo(() => {
    const map = new Map<string, DayAvailability[]>();
    for (const entry of days) {
      const list = map.get(entry.day) ?? [];
      list.push(entry);
      map.set(entry.day, list);
    }
    return map;
  }, [days]);

  const todayKey = dayKey(new Date());
  const month = anchor.getMonth();

  return (
    <div className="space-y-4">
      {/* Tech legend — click a name to trace their month. */}
      {techs.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-meta uppercase text-muted-text">Highlight</span>
          {techs.map((tech) => {
            const on = highlight === tech.id;
            return (
              <Pressable
                key={tech.id}
                onClick={() => setHighlight(on ? null : tech.id)}
                onMouseEnter={() => setHighlight(tech.id)}
                onMouseLeave={() => setHighlight((current) => (current === tech.id ? null : current))}
                aria-pressed={on}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                  on
                    ? "border-accent-default bg-accent-subtle text-accent-default"
                    : "border-subtle bg-surface-raised text-secondary-text hover:bg-surface-overlay",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-[0.625rem] font-bold",
                    on ? "bg-accent-default text-on-accent" : "bg-surface-overlay text-muted-text",
                  )}
                >
                  {initials(tech.full_name)}
                </span>
                {tech.full_name}
              </Pressable>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
        <div className="grid grid-cols-7 border-b border-subtle bg-surface-sunken">
          {WEEKDAYS.map((label) => (
            <div key={label} className="px-2 py-2 text-center text-meta uppercase text-muted-text">
              {label}
            </div>
          ))}
        </div>

        <Stagger className="grid grid-cols-7" step={0.008}>
          {cells.map((cell) => {
            const key = dayKey(cell);
            const entries = byDay.get(key) ?? [];
            const shifts = entries.filter((entry) => entry.kind === "shift");
            const carveOuts = entries.filter((entry) => entry.kind !== "shift");
            const bookings = shifts.reduce((sum, entry) => sum + entry.booking_count, 0);
            const inMonth = cell.getMonth() === month;
            const isToday = key === todayKey;
            const mine = shifts.some((entry) => entry.tech_id === currentUserId);

            return (
              <StaggerItem key={key}>
                <Pressable
                  onClick={() => setOpenDay(key)}
                  aria-label={`${cell.toDateString()} — ${shifts.length} working`}
                  className={cn(
                    // A whole calendar square is the tap target, which on a
                    // tablet is the difference between usable and not.
                    "flex h-28 w-full flex-col gap-1 border-b border-r border-subtle p-1.5 text-left transition-colors hover:bg-surface-overlay",
                    !inMonth && "opacity-40",
                    isToday && "bg-accent-subtle/40",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                        isToday
                          ? "bg-accent-default text-on-accent"
                          : mine
                            ? "text-accent-default"
                            : "text-secondary-text",
                      )}
                    >
                      {cell.getDate()}
                    </span>
                    {bookings > 0 ? (
                      <span className="ml-auto rounded-full bg-info-bg px-1.5 text-[0.625rem] font-bold tabular-nums text-info">
                        {bookings}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap content-start gap-1 overflow-hidden">
                    {shifts.slice(0, 4).map((entry) => {
                      const dim = highlight !== null && highlight !== entry.tech_id;
                      return (
                        <motion.span
                          key={entry.tech_id}
                          animate={{ opacity: dim ? 0.2 : 1 }}
                          transition={{ duration: 0.15 }}
                          title={`${entry.tech_name} · ${clock(entry.starts_at)}–${clock(entry.ends_at)}`}
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full text-[0.625rem] font-bold",
                            entry.tech_id === currentUserId
                              ? "bg-accent-default text-on-accent"
                              : "bg-surface-overlay text-secondary-text",
                          )}
                        >
                          {initials(entry.tech_name)}
                        </motion.span>
                      );
                    })}
                    {shifts.length > 4 ? (
                      <span className="flex size-6 items-center justify-center text-[0.625rem] font-semibold text-muted-text">
                        +{shifts.length - 4}
                      </span>
                    ) : null}
                  </div>

                  {carveOuts.length > 0 ? (
                    <span className="mt-auto truncate text-[0.625rem] text-warning">
                      {carveOuts.length} out
                    </span>
                  ) : null}
                </Pressable>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>

      <DayPanel
        day={openDay}
        entries={openDay ? (byDay.get(openDay) ?? []) : []}
        techs={techs}
        currentUserId={currentUserId}
        canManageFloor={canManageFloor}
        onClose={() => setOpenDay(null)}
        onOpenSchedule={(day) => {
          setOpenDay(null);
          onOpenDay(day);
        }}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

/**
 * One day, opened.
 *
 * Shows who is in, then lets you say when *you* are in. A manager gets a tech
 * picker; everyone else can only ever write their own row, which the database
 * enforces regardless of what the form sends.
 */
function DayPanel({
  day,
  entries,
  techs,
  currentUserId,
  canManageFloor,
  onClose,
  onOpenSchedule,
  onSaved,
}: {
  day: string | null;
  entries: DayAvailability[];
  techs: TechOption[];
  currentUserId: string;
  canManageFloor: boolean;
  onClose: () => void;
  onOpenSchedule: (day: string) => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ShiftKind>("shift");

  if (!day) return null;

  const [year, month, date] = day.split("-").map(Number);
  const pretty = new Date(year, month - 1, date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const working = entries.filter((entry) => entry.kind === "shift");
  const mine = entries.filter((entry) => entry.tech_id === currentUserId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pretty}</DialogTitle>
          <DialogDescription>
            {working.length === 0
              ? "Nobody has marked themselves in yet."
              : `${working.length} ${working.length === 1 ? "person" : "people"} in.`}
          </DialogDescription>
        </DialogHeader>

        {entries.length > 0 ? (
          <ul className="space-y-1.5">
            {entries.map((entry) => {
              const meta = KIND_META[entry.kind];
              const Icon = meta.icon;
              return (
                <li
                  key={`${entry.tech_id}-${entry.kind}-${entry.starts_at}`}
                  className="flex items-center gap-3 rounded-xl border border-subtle bg-surface-sunken px-3 py-2"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      meta.chip,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {entry.tech_name}
                    </p>
                    <p className="truncate text-meta text-muted-text">
                      {meta.label} · {clock(entry.starts_at)}–{clock(entry.ends_at)}
                      {entry.note ? ` · ${entry.note}` : ""}
                      {entry.kind === "shift" && entry.booking_count > 0
                        ? ` · ${entry.booking_count} booked`
                        : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <ActionForm
          action={setDayAvailability}
          resetOnSuccess={false}
          onSuccess={onSaved}
          className="space-y-3 border-t border-subtle pt-4"
        >
          <input type="hidden" name="day" value={day} />

          <div className="grid gap-3 sm:grid-cols-2">
            {canManageFloor ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="av_tech">Who</Label>
                <Select id="av_tech" name="tech_id" defaultValue={currentUserId}>
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

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="av_kind">What</Label>
              <Select
                id="av_kind"
                name="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as ShiftKind)}
              >
                <option value="shift">Working this day</option>
                <option value="break">Break</option>
                <option value="time_off">Out of office</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="av_from">From</Label>
              <Input
                id="av_from"
                name="from"
                type="time"
                step={900}
                defaultValue={kind === "shift" ? "09:00" : "12:00"}
                key={`from-${kind}`}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="av_to">To</Label>
              <Input
                id="av_to"
                name="to"
                type="time"
                step={900}
                defaultValue={kind === "shift" ? "17:00" : "13:00"}
                key={`to-${kind}`}
                required
              />
            </div>

            {kind !== "shift" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="av_note">Reason (optional)</Label>
                <Input id="av_note" name="note" placeholder="Dentist, school run…" />
              </div>
            ) : null}
          </div>

          <p className="text-meta text-muted-text">
            {kind === "shift"
              ? "Saying your hours again replaces them — breaks and time off stay."
              : "Sits inside your working hours. Two of these can't overlap each other."}
          </p>

          <SubmitButton className="w-full">
            {kind === "shift" ? "Mark as working" : "Add to the day"}
          </SubmitButton>
        </ActionForm>

        <div className="flex flex-wrap gap-2 border-t border-subtle pt-4">
          <Button variant="outline" onClick={() => onOpenSchedule(day)} className="flex-1">
            <CalendarDays className="size-4" />
            Open this day
          </Button>

          {mine.length > 0 || canManageFloor ? (
            <ActionForm action={clearDayAvailability} resetOnSuccess={false} onSuccess={onSaved}>
              <input type="hidden" name="day" value={day} />
              <input type="hidden" name="tech_id" value={currentUserId} />
              <SubmitButton variant="ghost">
                <Trash2 className="size-4" />
                Clear my day
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
