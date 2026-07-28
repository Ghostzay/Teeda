"use client";

import * as React from "react";
import { CalendarClock, Footprints, Plus, Trash2, UserCheck } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { ViewSwap, motion } from "@/components/motion";
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
import { Textarea } from "@/components/ui/textarea";
import { deleteShift, saveShift } from "@/lib/actions/shifts";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SHIFT_KIND_LABEL, type Profile, type ScheduleItem } from "@/lib/types";
import { layoutLanes, snapToSlot, toTimeInput } from "./lanes";

/** 15-minute granularity, at a height that keeps every tap target ≥44px. */
const SLOT_MINUTES = 15;
const SLOT_PX = 44;
const PX_PER_MIN = SLOT_PX / SLOT_MINUTES;

/**
 * Layer treatments are deliberately more than a hue change: shifts are a solid
 * tinted fill, read-only overlay layers are hatched and carry a type label, so
 * they stay distinguishable to anyone who can't rely on colour alone.
 */
const LAYER_STYLE = {
  shift: {
    className: "bg-primary-soft/70 border-primary/50 text-foreground",
    hatched: false,
    icon: UserCheck,
    label: { en: "Shift", vi: "Ca làm" },
  },
  appointment: {
    className: "bg-sky-bg border-sky/50 text-sky",
    hatched: true,
    icon: CalendarClock,
    label: { en: "Appointment", vi: "Lịch hẹn" },
  },
  walkin: {
    className: "bg-butter-bg border-butter/50 text-butter",
    hatched: true,
    icon: Footprints,
    label: { en: "Walk-in", vi: "Khách vãng lai" },
  },
} as const;

type Draft = {
  id: string | null;
  techId: string;
  start: string;
  end: string;
  kind: string;
  note: string;
  readOnly?: ScheduleItem;
};

export function ScheduleBoard({
  view,
  date,
  dateStr,
  techs,
  items,
  openHour,
  closeHour,
  currentUserId,
  canManageFloor,
  weekDays,
}: {
  view: "day" | "week";
  date: Date;
  dateStr: string;
  techs: Pick<Profile, "id" | "full_name">[];
  items: ScheduleItem[];
  openHour: number;
  closeHour: number;
  currentUserId: string;
  canManageFloor: boolean;
  /** Week view columns; ignored in day view. */
  weekDays?: { value: string; label: string; date: Date }[];
}) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const totalMinutes = (closeHour - openHour) * 60;
  const height = totalMinutes * PX_PER_MIN;
  const slotCount = totalMinutes / SLOT_MINUTES;
  const hours = Array.from({ length: closeHour - openHour + 1 }, (_, i) => openHour + i);

  // Open on the current hour rather than at 9am — the day is usually underway.
  React.useEffect(() => {
    const now = new Date();
    if (now.getHours() < openHour || now.getHours() >= closeHour) return;
    const offset = (now.getHours() - openHour) * 60 * PX_PER_MIN;
    scrollRef.current?.scrollTo({ top: Math.max(0, offset - 80), behavior: "auto" });
  }, [openHour, closeHour, view]);

  const columns =
    view === "day"
      ? techs.map((tech) => ({ key: tech.id, label: tech.full_name, techId: tech.id, date }))
      : (weekDays ?? []).map((day) => ({
          key: day.value,
          label: day.label,
          techId: techs[0]?.id ?? currentUserId,
          date: day.date,
        }));

  const openCreate = (techId: string, columnDate: Date, slotIndex: number) => {
    const start = new Date(columnDate);
    start.setHours(openHour, slotIndex * SLOT_MINUTES, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);

    setDraft({
      id: null,
      techId,
      start: toTimeInput(start),
      end: toTimeInput(snapToSlot(end, SLOT_MINUTES)),
      kind: "shift",
      note: "",
    });
  };

  const openItem = (item: ScheduleItem) => {
    if (item.layer !== "shift" || !item.editable) {
      setDraft({
        id: item.id,
        techId: item.tech_id,
        start: toTimeInput(new Date(item.starts_at)),
        end: toTimeInput(new Date(item.ends_at)),
        kind: item.kind,
        note: item.title ?? "",
        readOnly: item,
      });
      return;
    }

    setDraft({
      id: item.id,
      techId: item.tech_id,
      start: toTimeInput(new Date(item.starts_at)),
      end: toTimeInput(new Date(item.ends_at)),
      kind: item.kind,
      note: item.title ?? "",
    });
  };

  if (columns.length === 0) {
    return <EmptyBoard />;
  }

  return (
    <>
      <ViewSwap viewKey={`${view}-${dateStr}`}>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div ref={scrollRef} className="panel-scroll max-h-[62vh] overflow-x-auto">
            <div className="w-full min-w-max">
              {/* Column headers stay visible while the grid scrolls. */}
              <div className="sticky top-0 z-30 flex border-b border-border bg-surface-2">
                <div className="w-16 shrink-0 border-r border-border" />
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className="min-w-[9.5rem] flex-1 border-r border-border px-2 py-3 text-center last:border-r-0"
                  >
                    <p className="truncate text-sm font-semibold">{column.label}</p>
                  </div>
                ))}
              </div>

              <div className="relative flex" style={{ height }}>
                {/* Hour rail */}
                <div className="relative w-16 shrink-0 border-r border-border">
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="absolute right-2 -translate-y-1/2 text-meta font-medium tabular-nums text-muted-foreground"
                      style={{ top: (hour - openHour) * 60 * PX_PER_MIN }}
                    >
                      {formatHour(hour)}
                    </div>
                  ))}
                </div>

                {columns.map((column) => {
                  const columnItems = items.filter((item) => {
                    if (view === "day") return item.tech_id === column.techId;
                    const start = new Date(item.starts_at);
                    return start.toDateString() === column.date.toDateString();
                  });
                  // A shift is the container the day happens inside, so it
                  // spans the full column as a background band. Only the
                  // read-only bookings compete for lanes — otherwise an
                  // 8-hour shift would sit at a third width all day just
                  // because two clients overlapped it at 10am.
                  const shifts = columnItems.filter((entry) => entry.layer === "shift");
                  const laid = layoutLanes(columnItems.filter((entry) => entry.layer !== "shift"));
                  const columnStart = new Date(column.date);
                  columnStart.setHours(openHour, 0, 0, 0);

                  return (
                    <div
                      key={column.key}
                      className="relative min-w-[9.5rem] flex-1 border-r border-border last:border-r-0"
                    >
                      {/* Tap targets: one per 15 minutes, each a full 44px row. */}
                      {Array.from({ length: slotCount }, (_, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => openCreate(column.techId, column.date, index)}
                          aria-label={`Add a shift at ${slotLabel(openHour, index)}`}
                          className={cn(
                            "absolute inset-x-0 border-t transition-colors hover:bg-primary/10",
                            index % 4 === 0 ? "border-border" : "border-border/35",
                          )}
                          style={{ top: index * SLOT_PX, height: SLOT_PX }}
                        />
                      ))}

                      {shifts.map((item) => {
                        const style = LAYER_STYLE.shift;
                        const Icon = style.icon;
                        const top =
                          ((Date.parse(item.starts_at) - columnStart.getTime()) / 60_000) *
                          PX_PER_MIN;
                        const blockHeight =
                          ((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / 60_000) *
                          PX_PER_MIN;

                        return (
                          <motion.button
                            key={`shift-${item.id}`}
                            type="button"
                            onClick={() => openItem(item)}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.16 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                              "absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1 text-left",
                              style.className,
                            )}
                            style={{ top: Math.max(top, 0), height: Math.max(blockHeight, 30) }}
                          >
                            <span className="flex items-center gap-1 text-meta font-semibold uppercase">
                              <Icon className="size-3 shrink-0" />
                              {item.kind === "shift" ? style.label.en : item.title}
                            </span>
                            <span className="mt-0.5 block truncate text-meta opacity-80">
                              {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
                            </span>
                          </motion.button>
                        );
                      })}

                      {laid.map(({ item, lane, lanes }) => {
                        const style = LAYER_STYLE[item.layer as keyof typeof LAYER_STYLE];
                        const Icon = style.icon;

                        const top =
                          ((Date.parse(item.starts_at) - columnStart.getTime()) / 60_000) *
                          PX_PER_MIN;
                        const blockHeight =
                          ((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / 60_000) *
                          PX_PER_MIN;

                        const widthPct = 100 / lanes;

                        return (
                          <motion.button
                            key={`${item.layer}-${item.id}`}
                            type="button"
                            onClick={() => openItem(item)}
                            initial={{ opacity: 0, scale: 0.985 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.16 }}
                            whileTap={{ scale: 0.97 }}
                            className={cn(
                              "absolute z-10 overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm",
                              style.className,
                              style.hatched && "fill-hatched",
                            )}
                            style={{
                              top: Math.max(top, 0),
                              height: Math.max(blockHeight, 30),
                              left: `calc(${lane * widthPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                            }}
                          >
                            <span className="flex items-center gap-1 text-meta font-semibold uppercase">
                              <Icon className="size-3 shrink-0" />
                              <span className="truncate">{style.label.en}</span>
                            </span>
                            {blockHeight > 42 ? (
                              <span className="mt-0.5 block truncate text-xs font-medium leading-tight">
                                {item.title ?? formatTime(item.starts_at)}
                              </span>
                            ) : null}
                            {blockHeight > 66 ? (
                              <span className="block truncate text-meta opacity-80">
                                {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
                              </span>
                            ) : null}
                          </motion.button>
                        );
                      })}
                    </div>
                  );
                })}

                <NowLine
                  date={date}
                  view={view}
                  openHour={openHour}
                  closeHour={closeHour}
                />
              </div>
            </div>
          </div>
        </div>
      </ViewSwap>

      <SlotDialog
        draft={draft}
        onClose={() => setDraft(null)}
        techs={techs}
        dateStr={dateStr}
        canManageFloor={canManageFloor}
        currentUserId={currentUserId}
      />
    </>
  );
}

function NowLine({
  date,
  view,
  openHour,
  closeHour,
}: {
  date: Date;
  view: "day" | "week";
  openHour: number;
  closeHour: number;
}) {
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (view === "day" && !sameDay) return null;
  if (now.getHours() < openHour || now.getHours() >= closeHour) return null;

  const top = ((now.getHours() - openHour) * 60 + now.getMinutes()) * PX_PER_MIN;

  return (
    <div
      className="pointer-events-none absolute left-16 right-0 z-20 border-t-2 border-primary"
      style={{ top }}
    >
      <span className="absolute -top-[5px] left-0 size-2.5 rounded-full bg-primary" />
    </div>
  );
}

function SlotDialog({
  draft,
  onClose,
  techs,
  dateStr,
  canManageFloor,
  currentUserId,
}: {
  draft: Draft | null;
  onClose: () => void;
  techs: Pick<Profile, "id" | "full_name">[];
  dateStr: string;
  canManageFloor: boolean;
  currentUserId: string;
}) {
  const readOnly = draft?.readOnly;
  const isEdit = Boolean(draft?.id) && !readOnly;

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {readOnly ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {readOnly.layer === "appointment" ? "Appointment" : "Walk-in"}
              </DialogTitle>
              <DialogDescription>
                Read-only here — change it from{" "}
                {readOnly.layer === "appointment" ? "Appointments" : "Jobs & check-ins"}.
              </DialogDescription>
            </DialogHeader>

            <dl className="space-y-2 rounded-lg bg-surface-2 p-4 text-sm">
              <Row label="Who" value={readOnly.title ?? "—"} />
              <Row label="Tech" value={readOnly.tech_name} />
              <Row
                label="Time"
                value={`${formatTime(readOnly.starts_at)} – ${formatTime(readOnly.ends_at)}`}
              />
              <Row label="Status" value={readOnly.status ?? "—"} />
            </dl>

            <Button size="lg" variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isEdit ? "Edit shift" : "Add a shift"}</DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Change the hours, or remove the shift entirely."
                  : "Blocks out when this tech is working. Appointments can sit inside it."}
              </DialogDescription>
            </DialogHeader>

            <ActionForm
              action={saveShift}
              resetOnSuccess={false}
              onSuccess={onClose}
              className="space-y-4"
            >
              {draft?.id ? <input type="hidden" name="id" value={draft.id} /> : null}
              <input type="hidden" name="date" value={dateStr} />

              {canManageFloor ? (
                <div className="space-y-1.5">
                  <Label htmlFor="shift_tech">Tech</Label>
                  <Select id="shift_tech" name="tech_id" defaultValue={draft?.techId}>
                    {techs.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <input type="hidden" name="tech_id" value={draft?.techId ?? currentUserId} />
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="shift_start">From</Label>
                  <Input
                    id="shift_start"
                    name="start_time"
                    type="time"
                    step={900}
                    defaultValue={draft?.start}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shift_end">To</Label>
                  <Input
                    id="shift_end"
                    name="end_time"
                    type="time"
                    step={900}
                    defaultValue={draft?.end}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shift_kind">Type</Label>
                <Select id="shift_kind" name="kind" defaultValue={draft?.kind ?? "shift"}>
                  {Object.entries(SHIFT_KIND_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label.en} · {label.vi}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shift_note">Note</Label>
                <Textarea
                  id="shift_note"
                  name="note"
                  rows={2}
                  defaultValue={draft?.note}
                  placeholder="Optional"
                />
              </div>

              <SubmitButton size="lg" className="w-full">
                <Plus className="size-4" />
                {isEdit ? "Save changes" : "Add shift"}
              </SubmitButton>
            </ActionForm>

            {isEdit && draft?.id ? (
              <ActionButton
                action={deleteShift}
                fields={{ id: draft.id }}
                variant="ghost"
                size="lg"
                confirm="Remove this shift?"
                className="[&>button]:w-full [&>button]:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete shift
              </ActionButton>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <p className="text-title">Nobody to schedule yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Add technicians on Staff &amp; Techs, then their shifts appear here.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Chưa có thợ nào — thêm thợ ở trang Nhân viên.
      </p>
    </div>
  );
}

/** Skeleton shown while the board's data is in flight. */
export function ScheduleBoardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card"
      role="status"
      aria-label="Loading the schedule"
    >
      <div className="flex border-b border-border bg-surface-2">
        <div className="w-16 shrink-0 border-r border-border" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="min-w-[9.5rem] flex-1 border-r border-border px-2 py-3 last:border-r-0">
            <div className="mx-auto h-4 w-20 animate-pulse rounded bg-surface-3" />
          </div>
        ))}
      </div>
      <div className="flex" style={{ height: 420 }}>
        <div className="w-16 shrink-0 border-r border-border" />
        {Array.from({ length: 3 }, (_, column) => (
          <div key={column} className="min-w-[9.5rem] flex-1 space-y-3 border-r border-border p-2 last:border-r-0">
            {[110, 70, 150].map((h, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg bg-surface-3"
                style={{ height: h, animationDelay: `${(column * 3 + i) * 60}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

function slotLabel(openHour: number, index: number): string {
  const total = openHour * 60 + index * SLOT_MINUTES;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
