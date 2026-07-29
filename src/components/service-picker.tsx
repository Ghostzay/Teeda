"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";

import { Pressable } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import {
  ALL_SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABEL,
  SKILL_LABEL,
  type ServiceMenuItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Pick one service or five, from a menu grouped the way the wall menu is.
 *
 * A client asking for a gel manicure, a pedicure and nail art is one client and
 * one turn, so this is a basket rather than three bookings. It emits a hidden
 * `service_ids` input per pick and a combined `service_name`, which is what the
 * `book_appointment` / `check_in_walkin` RPCs take.
 *
 * The running total is the reason the desk trusts it: three taps and the price
 * they quote the client is already on screen, before anything is saved.
 */
export function ServicePicker({
  services,
  name = "service_ids",
  defaultSelected = [],
  /** Off-menu work still has to be bookable; the desk types it instead. */
  allowCustom = true,
  onChange,
}: {
  services: ServiceMenuItem[];
  name?: string;
  defaultSelected?: string[];
  allowCustom?: boolean;
  onChange?: (picked: ServiceMenuItem[]) => void;
}) {
  const active = useMemo(() => services.filter((item) => item.is_active), [services]);

  const [picked, setPicked] = useState<string[]>(() =>
    defaultSelected.filter((id) => services.some((item) => item.id === id)),
  );
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>("all");

  const chosen = useMemo(
    () =>
      picked
        .map((id) => active.find((item) => item.id === id))
        .filter((item): item is ServiceMenuItem => Boolean(item)),
    [picked, active],
  );

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      onChange?.(
        next
          .map((value) => active.find((item) => item.id === value))
          .filter((item): item is ServiceMenuItem => Boolean(item)),
      );
      return next;
    });

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return active.filter((item) => {
      if (tab !== "all" && item.category !== tab) return false;
      return !needle || item.name.toLowerCase().includes(needle);
    });
  }, [active, tab, query]);

  const groups = useMemo(() => {
    const order = tab === "all" ? ALL_SERVICE_CATEGORIES : [tab];
    return order
      .map((category) => ({ category, items: shown.filter((item) => item.category === category) }))
      .filter((group) => group.items.length > 0);
  }, [shown, tab]);

  const total = chosen.reduce((sum, item) => sum + Number(item.price), 0);
  const minutes = chosen.reduce((sum, item) => sum + (item.duration_minutes ?? 0), 0);

  // The union, because one tech does the whole visit — which is exactly what
  // `skills_for_services` computes server-side.
  const needed = [...new Set(chosen.flatMap((item) => item.effective_skills))].sort();

  // The name column keeps its single-line label. Sending it explicitly means
  // the desk's typing wins over the generated join.
  const label = custom.trim() || chosen.map((item) => item.name).join(" + ");

  const tabs = useMemo(
    () => ["all", ...ALL_SERVICE_CATEGORIES.filter((c) => active.some((i) => i.category === c))],
    [active],
  );

  return (
    <div className="space-y-2">
      {picked.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <input type="hidden" name="service_name" value={label} />

      {active.length === 0 ? (
        <Input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Gel manicure"
          required
          autoComplete="off"
          aria-label="Service"
        />
      ) : (
        <>
          <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1">
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
                  tab === id
                    ? "bg-surface-overlay text-primary-text"
                    : "text-muted-text hover:text-primary-text",
                )}
              >
                {id === "all"
                  ? "All"
                  : SERVICE_CATEGORY_LABEL[id as keyof typeof SERVICE_CATEGORY_LABEL]}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the menu…"
              aria-label="Search the menu"
              className="pl-9"
            />
          </div>

          <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-subtle bg-surface-raised p-2">
            {groups.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-text">
                Nothing on the menu matches that.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.category} className="space-y-1">
                  <p className="px-1 text-meta font-semibold uppercase tracking-wide text-muted-text">
                    {SERVICE_CATEGORY_LABEL[group.category as keyof typeof SERVICE_CATEGORY_LABEL]}
                  </p>
                  <div className="grid gap-1">
                    {group.items.map((item) => {
                      const on = picked.includes(item.id);
                      return (
                        <Pressable
                          key={item.id}
                          onClick={() => toggle(item.id)}
                          aria-pressed={on}
                          className={cn(
                            "flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                            on
                              ? "border-accent-border bg-accent-subtle"
                              : "border-transparent hover:bg-surface-overlay",
                          )}
                        >
                          {/* An explicit small radius, not `rounded-md`: this
                              theme's radius scale is generous enough that a
                              20px box comes out a circle, and a circle is the
                              universal "pick one" affordance. This is a
                              basket — several is the point. */}
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-[0.375rem] border",
                              on
                                ? "border-transparent bg-accent-default text-on-accent"
                                : "border-strong",
                            )}
                          >
                            {on ? <Check className="size-3.5" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.name}</span>
                            {item.duration_minutes ? (
                              <span className="block text-meta text-muted-text">
                                {item.duration_minutes} min
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatMoney(item.price)}
                          </span>
                        </Pressable>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {chosen.length > 0 ? (
            <div className="space-y-1.5 rounded-xl border border-subtle bg-surface-sunken p-2.5">
              <div className="flex flex-wrap gap-1.5">
                {chosen.map((item) => (
                  <Pressable
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent-border bg-accent-subtle px-3 text-sm font-medium text-accent-default"
                  >
                    {item.name}
                    <X className="size-3.5" />
                  </Pressable>
                ))}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                <span className="text-meta text-muted-text">
                  {chosen.length} {chosen.length === 1 ? "service" : "services"}
                  {minutes > 0 ? ` · about ${minutes} min` : ""}
                </span>
                <span className="text-base font-semibold tabular-nums">{formatMoney(total)}</span>
              </div>
              {needed.length > 0 ? (
                <p className="px-1 text-meta text-muted-text">
                  Needs {needed.map((skill) => SKILL_LABEL[skill]).join(" + ")} — the rotation will
                  only offer this to a tech who has all of it.
                </p>
              ) : null}
            </div>
          ) : null}

          {allowCustom ? (
            <Input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={
                chosen.length > 0 ? "Override the label (optional)" : "Or type something off-menu"
              }
              autoComplete="off"
              aria-label="Off-menu service"
              required={chosen.length === 0}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
