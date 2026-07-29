"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Search, Users } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { Pressable, Stagger, StaggerItem, ViewSwap } from "@/components/motion";
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
import { deleteService, setServiceActive, upsertService } from "@/lib/actions/services";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ALL_SERVICE_CATEGORIES,
  ALL_SKILLS,
  CATEGORY_BASE_SKILLS,
  SERVICE_CATEGORY_LABEL,
  SKILL_LABEL,
  type ServiceCategory,
  type ServiceMenuItem,
  type Skill,
} from "@/lib/types";

type Tab = ServiceCategory | "all";

/**
 * The salon's menu, by category. Managers only.
 *
 * A flat price list was fine at eight services and unusable at thirty, which
 * is where a salon lands once every manicure has a VIP, a gel and a spa
 * variant. Categories are the same grouping a client reads on the wall, so
 * "where does this live?" never needs a decision.
 *
 * Prices sit in the row, not behind an edit dialog: the most common reason a
 * manager opens this screen is to check one, and the second is to change one.
 */
export function ServiceManager({ services }: { services: ServiceMenuItem[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<Tab, number>();
    const visible = services.filter((item) => showHidden || item.is_active);
    map.set("all", visible.length);
    for (const category of ALL_SERVICE_CATEGORIES) {
      map.set(category, visible.filter((item) => item.category === category).length);
    }
    return map;
  }, [services, showHidden]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return services.filter((item) => {
      if (!showHidden && !item.is_active) return false;
      if (tab !== "all" && item.category !== tab) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        SERVICE_CATEGORY_LABEL[item.category].toLowerCase().includes(needle)
      );
    });
  }, [services, tab, query, showHidden]);

  // On "All" the list keeps its category headings, so the grouping survives
  // the one view where you can see everything at once.
  const groups = useMemo(() => {
    const order = tab === "all" ? ALL_SERVICE_CATEGORIES : [tab as ServiceCategory];
    return order
      .map((category) => ({
        category,
        items: shown.filter((item) => item.category === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [shown, tab]);

  const hiddenCount = services.filter((item) => !item.is_active).length;

  return (
    <section aria-label="Service menu" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title">Service menu</h2>
        <ServiceDialog defaultCategory={tab === "all" ? "manicure" : tab} />
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1">
        {(["all", ...ALL_SERVICE_CATEGORIES] as Tab[]).map((id) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-surface-overlay text-primary-text"
                  : "text-muted-text hover:text-primary-text",
              )}
            >
              {id === "all" ? "All" : SERVICE_CATEGORY_LABEL[id]}
              <span className="tabular-nums opacity-70">{counts.get(id) ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a service…"
            aria-label="Find a service"
            className="pl-9"
          />
        </div>
        {hiddenCount > 0 ? (
          <Button
            type="button"
            variant={showHidden ? "default" : "outline"}
            onClick={() => setShowHidden((value) => !value)}
          >
            {showHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {hiddenCount} hidden
          </Button>
        ) : null}
      </div>

      <ViewSwap viewKey={`${tab}-${showHidden}`}>
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-subtle bg-surface-raised px-4 py-10 text-center text-sm text-muted-text">
            {query.trim()
              ? `Nothing on the menu matches “${query.trim()}”.`
              : "Nothing in this part of the menu yet."}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.category} className="space-y-1.5">
                {tab === "all" ? (
                  <h3 className="px-1 text-meta font-semibold uppercase tracking-wide text-muted-text">
                    {SERVICE_CATEGORY_LABEL[group.category]}
                  </h3>
                ) : null}
                <Stagger className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-raised">
                  {group.items.map((item) => (
                    <StaggerItem key={item.id}>
                      <ServiceRow item={item} />
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            ))}
          </div>
        )}
      </ViewSwap>
    </section>
  );
}

function ServiceRow({ item }: { item: ServiceMenuItem }) {
  return (
    // Two rows on a phone, one on a tablet. Sharing a line at 390px squeezed
    // the name to "Gel ma…", which is indistinguishable from "Gel pedicure" —
    // a price list you cannot read is not a price list.
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3",
        !item.is_active && "opacity-60",
      )}
    >
      <div className="w-full min-w-0 sm:flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.name}</p>
          {!item.is_active ? (
            <span className="rounded-full border border-subtle px-2 py-0.5 text-meta text-muted-text">
              Hidden
            </span>
          ) : null}
        </div>
        <p className="text-meta text-muted-text">
          {item.duration_minutes ? `${item.duration_minutes} min · ` : ""}
          {item.effective_skills.length > 0
            ? item.effective_skills.map((skill) => SKILL_LABEL[skill]).join(" · ")
            : "Any tech"}
        </p>
      </div>

      <span className="shrink-0 text-base font-semibold tabular-nums">
        {formatMoney(item.price)}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
        <ActionButton
          action={setServiceActive}
          fields={{ id: item.id, is_active: item.is_active ? "false" : "true" }}
          variant="ghost"
          size="icon"
          silentSuccess
        >
          {item.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          <span className="sr-only">
            {item.is_active ? `Hide ${item.name}` : `Show ${item.name}`}
          </span>
        </ActionButton>
        <ServiceDialog service={item} defaultCategory={item.category} />
        <ActionButton
          action={deleteService}
          fields={{ id: item.id }}
          variant="ghost"
          size="icon"
          confirm={`Remove ${item.name} from the menu? Past jobs keep their recorded price. If you only want it off the booking list, hide it instead.`}
        >
          <span aria-hidden>×</span>
          <span className="sr-only">Delete {item.name}</span>
        </ActionButton>
      </div>
    </div>
  );
}

function ServiceDialog({
  service,
  defaultCategory,
}: {
  service?: ServiceMenuItem;
  defaultCategory: ServiceCategory;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ServiceCategory>(service?.category ?? defaultCategory);
  const [skills, setSkills] = useState<Skill[]>(service?.required_skills ?? []);
  const isEdit = Boolean(service);

  // The base skill is the point of the whole thing: a manager types only the
  // *extra* requirement, and "VIP Manicure" stays staffable by anyone who does
  // manicures without anyone having to remember to say so.
  const base = CATEGORY_BASE_SKILLS[category];
  const effective = [...new Set([...base, ...skills])].sort();

  const toggle = (skill: Skill) =>
    setSkills((current) =>
      current.includes(skill) ? current.filter((value) => value !== skill) : [...current, skill],
    );

  const reset = () => {
    setCategory(service?.category ?? defaultCategory);
    setSkills(service?.required_skills ?? []);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
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
            The category decides where this sits on the menu — and carries the skill it obviously
            needs, so you only add the extras.
          </DialogDescription>
        </DialogHeader>

        <ActionForm
          action={upsertService}
          resetOnSuccess={!isEdit}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
          className="space-y-4"
        >
          {service ? <input type="hidden" name="id" value={service.id} /> : null}
          <input type="hidden" name="category" value={category} />
          {skills.map((skill) => (
            <input key={skill} type="hidden" name="required_skills" value={skill} />
          ))}

          <div className="space-y-1.5">
            <Label htmlFor={`name-${service?.id ?? "new"}`}>Name</Label>
            <Input
              id={`name-${service?.id ?? "new"}`}
              name="name"
              defaultValue={service?.name}
              placeholder="VIP manicure"
              required
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`category-${service?.id ?? "new"}`}>Part of the menu</Label>
            <Select
              id={`category-${service?.id ?? "new"}`}
              value={category}
              onChange={(event) => setCategory(event.target.value as ServiceCategory)}
            >
              {ALL_SERVICE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {SERVICE_CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
            <div className="space-y-1.5">
              <Label htmlFor={`sort-${service?.id ?? "new"}`}>Position</Label>
              <Input
                id={`sort-${service?.id ?? "new"}`}
                name="sort_order"
                inputMode="numeric"
                defaultValue={service?.sort_order ?? ""}
                placeholder="10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Extra skills needed</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_SKILLS.map((skill) => {
                const inherited = base.includes(skill);
                const isOn = inherited || skills.includes(skill);
                return (
                  <Pressable
                    key={skill}
                    onClick={() => !inherited && toggle(skill)}
                    disabled={inherited}
                    aria-pressed={isOn}
                    title={
                      inherited
                        ? `Every ${SERVICE_CATEGORY_LABEL[category].toLowerCase()} needs this`
                        : undefined
                    }
                    className={cn(
                      "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      inherited
                        ? "cursor-default border-accent-border bg-accent-subtle text-accent-default"
                        : isOn
                          ? "border-transparent bg-accent-default text-on-accent"
                          : "border-subtle text-muted-text hover:text-primary-text",
                    )}
                  >
                    {SKILL_LABEL[skill]}
                    {inherited ? <span className="ml-1 opacity-70">· from category</span> : null}
                  </Pressable>
                );
              })}
            </div>
            <p className="flex items-start gap-1.5 text-meta text-muted-text">
              <Users className="mt-0.5 size-3.5 shrink-0" />
              {effective.length === 0
                ? "Any tech can be given this."
                : `Only techs with ${effective.map((skill) => SKILL_LABEL[skill]).join(" + ")} will be offered this.`}
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
