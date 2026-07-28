"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateMySkills, updateTechSkills } from "@/lib/actions/rotation";
import { cn } from "@/lib/utils";
import { ALL_SKILLS, SKILL_LABEL, type Skill } from "@/lib/types";

/**
 * What a tech offers. Drives skill-based assignment: the rotation only hands
 * someone a service they've said they do, so this is worth keeping honest.
 */
export function SkillsEditor({
  skills,
  techId,
  title = "What I do",
  description = "The rotation only sends you services you've selected here.",
}: {
  skills: Skill[];
  /** Set to edit another tech's skills (manager). Omit to edit your own. */
  techId?: string;
  title?: string;
  description?: string;
}) {
  const [selected, setSelected] = useState<Skill[]>(skills);

  const toggle = (skill: Skill) =>
    setSelected((current) =>
      current.includes(skill) ? current.filter((value) => value !== skill) : [...current, skill],
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent>
        <ActionForm
          action={techId ? updateTechSkills : updateMySkills}
          resetOnSuccess={false}
          className="space-y-4"
        >
          {techId ? <input type="hidden" name="tech_id" value={techId} /> : null}

          {/* Hidden inputs carry the selection; the chips are the control. */}
          {selected.map((skill) => (
            <input key={skill} type="hidden" name="skills" value={skill} />
          ))}

          <div className="flex flex-wrap gap-2">
            {ALL_SKILLS.map((skill) => {
              const isOn = selected.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggle(skill)}
                  aria-pressed={isOn}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
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

          <SubmitButton size="lg" className="w-full sm:w-auto">
            Save
          </SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
