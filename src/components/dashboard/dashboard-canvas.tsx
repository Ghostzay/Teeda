"use client";

import { useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  Check,
  Columns2,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  RotateCcw,
  Rows3,
  Square,
} from "lucide-react";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { saveDashboardLayout } from "@/lib/actions/dashboard";
import {
  WIDGETS,
  defaultLayout,
  toStored,
  widgetById,
  type ResolvedLayout,
  type Slot,
  type WidgetId,
} from "@/lib/dashboard";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const SLOT_META: Record<Slot, { label: string; icon: typeof Square }> = {
  full: { label: "Full width", icon: Rows3 },
  main: { label: "Main column", icon: Columns2 },
  side: { label: "Side column", icon: Square },
};

const SLOT_ORDER: Slot[] = ["full", "main", "side"];

/**
 * The arrangeable dashboard.
 *
 * ---------------------------------------------------------------------------
 * Why an edit mode
 * ---------------------------------------------------------------------------
 * Half of these panels are workstations, not read-outs — assign buttons, Start,
 * Complete, take a payment. On a mounted tablet, an always-live drag handle
 * sitting next to those means a mis-grab moves a panel while someone is working
 * the queue. So drag is off entirely until you ask for it: outside edit mode
 * this renders exactly what the old fixed dashboard rendered.
 *
 * Inside edit mode the panels are inert and covered by their own controls, so a
 * stray tap cannot start a job either.
 *
 * ---------------------------------------------------------------------------
 * Why buttons as well as drag
 * ---------------------------------------------------------------------------
 * Dragging *between* columns on touch is where these interfaces get flaky, so
 * moving between slots is a button. That also makes the whole feature work
 * one-handed, with a keyboard, and for anyone who cannot drag accurately.
 */
export function DashboardCanvas({
  layout: initial,
  nodes,
  role,
}: {
  layout: ResolvedLayout;
  /** Server-rendered widget content, keyed by id. Only visible widgets appear. */
  nodes: Partial<Record<WidgetId, React.ReactNode>>;
  role: UserRole;
}) {
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(initial);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // A fresh server render (realtime refresh, navigation) is authoritative
  // unless the user is mid-edit, where clobbering their work would be rude.
  useEffect(() => {
    if (!editing) setLayout(initial);
  }, [initial, editing]);

  const setSlot = (slot: Slot, ids: WidgetId[]) =>
    setLayout((current) => ({ ...current, [slot]: ids }));

  const move = (id: WidgetId, to: Slot) =>
    setLayout((current) => {
      const next: ResolvedLayout = {
        full: current.full.filter((entry) => entry !== id),
        main: current.main.filter((entry) => entry !== id),
        side: current.side.filter((entry) => entry !== id),
        hidden: current.hidden.filter((entry) => entry !== id),
      };
      next[to] = [...next[to], id];
      return next;
    });

  const hide = (id: WidgetId) =>
    setLayout((current) => ({
      full: current.full.filter((entry) => entry !== id),
      main: current.main.filter((entry) => entry !== id),
      side: current.side.filter((entry) => entry !== id),
      hidden: [...current.hidden.filter((entry) => entry !== id), id],
    }));

  const show = (id: WidgetId) => {
    const widget = widgetById(id);
    move(id, widget?.defaultSlot ?? "main");
  };

  const persist = async (next: ResolvedLayout, message: string) => {
    setSaving(true);
    const result = await saveDashboardLayout(toStored(next));
    setSaving(false);
    toast(result.ok ? message : (result.error ?? "Couldn't save that."), result.ok ? "success" : "error");
    // A hidden widget's content was never fetched, so the page has to re-render
    // from the server before it can appear.
    if (result.ok) window.location.reload();
  };

  const hiddenWidgets = layout.hidden.map(widgetById).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                const fresh = defaultLayout(role);
                setLayout(fresh);
                void persist(fresh, "Back to the recommended layout.");
              }}
              disabled={saving}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button
              onClick={() => {
                setEditing(false);
                void persist(layout, "Dashboard saved.");
              }}
              disabled={saving}
            >
              <Check className="size-4" />
              Done
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <LayoutGrid className="size-4" />
            Customise
          </Button>
        )}
      </div>

      {editing ? (
        <p className="rounded-2xl border border-info-border bg-info-bg px-4 py-3 text-sm text-info">
          Drag to reorder within a column, or use the buttons to move a panel between columns and
          hide it. Nothing on the panels themselves will respond until you tap Done.
        </p>
      ) : null}

      <Column
        slot="full"
        ids={layout.full}
        nodes={nodes}
        editing={editing}
        onReorder={(ids) => setSlot("full", ids)}
        onMove={move}
        onHide={hide}
        className="space-y-5"
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Column
          slot="main"
          ids={layout.main}
          nodes={nodes}
          editing={editing}
          onReorder={(ids) => setSlot("main", ids)}
          onMove={move}
          onHide={hide}
          className="space-y-5"
        />
        <Column
          slot="side"
          ids={layout.side}
          nodes={nodes}
          editing={editing}
          onReorder={(ids) => setSlot("side", ids)}
          onMove={move}
          onHide={hide}
          className={cn("space-y-5", !editing && "xl:sticky xl:top-0")}
        />
      </div>

      {editing && hiddenWidgets.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-subtle bg-surface-sunken p-4">
          <h2 className="text-title">Hidden</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {hiddenWidgets.map((widget) => (
              <div
                key={widget!.id}
                className="flex items-center gap-3 rounded-xl border border-subtle bg-surface-raised px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{widget!.title}</p>
                  <p className="truncate text-meta text-muted-text">{widget!.description}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => show(widget!.id)}>
                  <Eye className="size-4" />
                  Show
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {editing && hiddenWidgets.length === 0 ? (
        <p className="rounded-2xl border border-subtle bg-surface-sunken px-4 py-3 text-sm text-muted-text">
          Every panel is on the dashboard. Hide one and it will appear here.
        </p>
      ) : null}
    </div>
  );
}

function Column({
  slot,
  ids,
  nodes,
  editing,
  onReorder,
  onMove,
  onHide,
  className,
}: {
  slot: Slot;
  ids: WidgetId[];
  nodes: Partial<Record<WidgetId, React.ReactNode>>;
  editing: boolean;
  onReorder: (ids: WidgetId[]) => void;
  onMove: (id: WidgetId, to: Slot) => void;
  onHide: (id: WidgetId) => void;
  className?: string;
}) {
  const present = useMemo(() => ids.filter((id) => nodes[id] !== undefined), [ids, nodes]);

  if (!editing) {
    return (
      <div className={className}>
        {present.map((id) => (
          <div key={id}>{nodes[id]}</div>
        ))}
      </div>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={present}
      onReorder={(next) => onReorder(next as WidgetId[])}
      className={className}
    >
      {present.map((id) => (
        <EditableWidget
          key={id}
          id={id}
          slot={slot}
          node={nodes[id]}
          onMove={onMove}
          onHide={onHide}
        />
      ))}
    </Reorder.Group>
  );
}

function EditableWidget({
  id,
  slot,
  node,
  onMove,
  onHide,
}: {
  id: WidgetId;
  slot: Slot;
  node: React.ReactNode;
  onMove: (id: WidgetId, to: Slot) => void;
  onHide: (id: WidgetId) => void;
}) {
  const controls = useDragControls();
  const widget = widgetById(id);

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="rounded-2xl border-2 border-dashed border-accent-default/50 bg-surface-canvas p-2"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* Drag from the handle only: dragging from anywhere would swallow the
            scroll gesture on a touch screen. */}
        <button
          type="button"
          onPointerDown={(event) => controls.start(event)}
          aria-label={`Reorder ${widget?.title ?? id}`}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-text hover:bg-surface-overlay active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{widget?.title ?? id}</p>

        {SLOT_ORDER.filter((option) => option !== slot).map((option) => {
          const meta = SLOT_META[option];
          const Icon = meta.icon;
          return (
            <Button key={option} size="sm" variant="outline" onClick={() => onMove(id, option)}>
              <Icon className="size-4" />
              <span className="hidden sm:inline">{meta.label}</span>
            </Button>
          );
        })}

        <Button size="sm" variant="ghost" onClick={() => onHide(id)}>
          <EyeOff className="size-4" />
          <span className="hidden sm:inline">Hide</span>
        </Button>
      </div>

      {/* Inert while editing: a stray tap must not start a job or take money. */}
      <div className="pointer-events-none select-none opacity-60">{node}</div>
    </Reorder.Item>
  );
}
