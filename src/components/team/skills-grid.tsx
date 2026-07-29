"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, Users, X } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Pressable, Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateSkills } from "@/lib/actions/profiles";
import { initials } from "@/lib/format";
import { ALL_SKILLS, SKILL_LABEL, type Skill, type TeamSkillRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Who can do what, as a grid you can edit.
 *
 * Skills are not decoration — the rotation refuses to hand someone work they
 * do not have the skill for, so a stale list quietly changes who gets offered
 * clients. That makes "everyone is certified on dip now" a thing that has to
 * be one action rather than a dozen visits to a dozen profiles.
 *
 * Tapping a cell toggles that one tech. Selecting rows opens the bulk bar,
 * which can also target the whole team.
 */
export function SkillsGrid({ rows }: { rows: TeamSkillRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [add, setAdd] = useState<Set<Skill>>(new Set());
  const [remove, setRemove] = useState<Set<Skill>>(new Set());
  const [everyone, setEveryone] = useState(false);

  const active = rows.filter((row) => row.is_active);
  const targetCount = everyone ? active.length : selected.size;

  const coverage = useMemo(() => {
    const map = new Map<Skill, number>();
    for (const skill of ALL_SKILLS) {
      map.set(skill, active.filter((row) => row.skills.includes(skill)).length);
    }
    return map;
  }, [active]);

  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cycle = (set: Set<Skill>, other: Set<Skill>, skill: Skill, apply: (s: Set<Skill>) => void, applyOther: (s: Set<Skill>) => void) => {
    const next = new Set(set);
    if (next.has(skill)) next.delete(skill);
    else {
      next.add(skill);
      // Add and remove are mutually exclusive: asking for both is a
      // contradiction the database would silently resolve for you.
      const cleaned = new Set(other);
      cleaned.delete(skill);
      applyOther(cleaned);
    }
    apply(next);
  };

  const clearBulk = () => {
    setAdd(new Set());
    setRemove(new Set());
    setSelected(new Set());
    setEveryone(false);
  };

  return (
    <div className="space-y-4">
      {/* Coverage: the number a manager actually wants — how exposed are we if
          one person calls in sick? */}
      <div className="flex flex-wrap gap-2">
        {ALL_SKILLS.map((skill) => {
          const count = coverage.get(skill) ?? 0;
          return (
            <span
              key={skill}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                count === 0
                  ? "border-danger-border bg-danger-bg text-danger"
                  : count === 1
                    ? "border-warning-border bg-warning-bg text-warning"
                    : "border-subtle bg-surface-raised text-secondary-text",
              )}
              title={
                count === 0
                  ? "Nobody offers this — bookings that need it cannot be assigned"
                  : count === 1
                    ? "Only one tech offers this"
                    : `${count} techs offer this`
              }
            >
              {SKILL_LABEL[skill]}
              <span className="font-bold tabular-nums">{count}</span>
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-subtle bg-surface-raised">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="border-b border-subtle bg-surface-sunken">
              <th className="sticky left-0 z-10 bg-surface-sunken px-4 py-3 text-left text-sm font-semibold">
                Technician
              </th>
              {ALL_SKILLS.map((skill) => (
                <th key={skill} className="px-2 py-3 text-center text-meta font-semibold uppercase">
                  {SKILL_LABEL[skill]}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-meta font-semibold uppercase">30 days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.tech_id}
                className={cn(
                  "border-b border-subtle last:border-b-0",
                  !row.is_active && "opacity-50",
                  selected.has(row.tech_id) && "bg-accent-subtle/40",
                )}
              >
                <td className="sticky left-0 z-10 bg-surface-raised px-4 py-2">
                  <Pressable
                    onClick={() => toggleRow(row.tech_id)}
                    disabled={!row.is_active}
                    aria-pressed={selected.has(row.tech_id)}
                    className="flex min-h-11 items-center gap-2.5"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold",
                        selected.has(row.tech_id)
                          ? "bg-accent-default text-on-accent"
                          : "bg-surface-overlay text-muted-text",
                      )}
                    >
                      {selected.has(row.tech_id) ? <Check className="size-4" /> : initials(row.full_name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium leading-tight">
                        {row.full_name}
                      </span>
                      {row.specialties ? (
                        <span className="block truncate text-meta text-muted-text">
                          {row.specialties}
                        </span>
                      ) : null}
                    </span>
                  </Pressable>
                </td>

                {ALL_SKILLS.map((skill) => {
                  const has = row.skills.includes(skill);
                  return (
                    <td key={skill} className="px-2 py-2 text-center">
                      <SingleToggle techId={row.tech_id} skill={skill} has={has} disabled={!row.is_active} />
                    </td>
                  );
                })}

                <td className="px-4 py-2 text-right text-sm tabular-nums text-muted-text">
                  {row.jobs_30d}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk bar. Appears once there is a target, so it never sits there
          inviting a mistake. */}
      <ActionForm
        action={updateSkills}
        resetOnSuccess={false}
        onSuccess={() => {
          clearBulk();
          router.refresh();
        }}
        className="space-y-3 rounded-2xl border border-subtle bg-surface-sunken p-4"
      >
        <input type="hidden" name="scope" value={everyone ? "everyone" : "selected"} />
        {!everyone
          ? [...selected].map((id) => (
              <input key={id} type="hidden" name="tech_ids" value={id} />
            ))
          : null}
        {[...add].map((skill) => (
          <input key={`add-${skill}`} type="hidden" name="add" value={skill} />
        ))}
        {[...remove].map((skill) => (
          <input key={`rm-${skill}`} type="hidden" name="remove" value={skill} />
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title">Change several at once</h3>
          <Button
            type="button"
            size="sm"
            variant={everyone ? "default" : "outline"}
            onClick={() => {
              setEveryone((value) => !value);
              setSelected(new Set());
            }}
          >
            <Users className="size-4" />
            {everyone ? "Whole team" : "Use whole team"}
          </Button>
          <span className="text-sm text-muted-text">
            {everyone
              ? `${active.length} active ${active.length === 1 ? "tech" : "techs"}`
              : selected.size > 0
                ? `${selected.size} selected`
                : "Tap names in the table to select"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SkillPicker
            title="Add"
            icon={Plus}
            tone="success"
            chosen={add}
            onToggle={(skill) => cycle(add, remove, skill, setAdd, setRemove)}
          />
          <SkillPicker
            title="Remove"
            icon={Minus}
            tone="danger"
            chosen={remove}
            onToggle={(skill) => cycle(remove, add, skill, setRemove, setAdd)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton disabled={targetCount === 0 || (add.size === 0 && remove.size === 0)}>
            Apply to {targetCount} {targetCount === 1 ? "tech" : "techs"}
          </SubmitButton>
          {add.size > 0 || remove.size > 0 || selected.size > 0 || everyone ? (
            <Button type="button" variant="ghost" onClick={clearBulk}>
              <X className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </ActionForm>
    </div>
  );
}

/** One cell: toggle a single skill on a single tech. */
function SingleToggle({
  techId,
  skill,
  has,
  disabled,
}: {
  techId: string;
  skill: Skill;
  has: boolean;
  disabled: boolean;
}) {
  const router = useRouter();

  return (
    <ActionForm action={updateSkills} resetOnSuccess={false} onSuccess={() => router.refresh()}>
      <input type="hidden" name="scope" value="selected" />
      <input type="hidden" name="tech_ids" value={techId} />
      <input type="hidden" name={has ? "remove" : "add"} value={skill} />
      <SubmitButton
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={`${has ? "Remove" : "Add"} ${SKILL_LABEL[skill]}`}
        className={cn(has ? "text-success" : "text-muted-text/40")}
      >
        {has ? <Check className="size-5" /> : <Plus className="size-4" />}
      </SubmitButton>
    </ActionForm>
  );
}

function SkillPicker({
  title,
  icon: Icon,
  tone,
  chosen,
  onToggle,
}: {
  title: string;
  icon: typeof Plus;
  tone: "success" | "danger";
  chosen: Set<Skill>;
  onToggle: (skill: Skill) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-xl border border-subtle bg-surface-raised p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
        <Icon className={cn("size-4", tone === "success" ? "text-success" : "text-danger")} />
        {title}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SKILLS.map((skill) => {
          const on = chosen.has(skill);
          return (
            <Pressable
              key={skill}
              onClick={() => onToggle(skill)}
              aria-pressed={on}
              className={cn(
                "min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors",
                on
                  ? tone === "success"
                    ? "border-success-border bg-success-bg text-success"
                    : "border-danger-border bg-danger-bg text-danger"
                  : "border-subtle text-secondary-text hover:bg-surface-overlay",
              )}
            >
              {SKILL_LABEL[skill]}
            </Pressable>
          );
        })}
      </div>
    </fieldset>
  );
}
