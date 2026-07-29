import Link from "next/link";
import { UserPlus, Users } from "lucide-react";

import { ActionButton, ActionSelect } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { CommissionEditor } from "@/components/commission-editor";
import { TechRail } from "@/components/dashboard/tech-rail";
import { SkillsGrid } from "@/components/team/skills-grid";
import { TechProfileDialog } from "@/components/team/tech-profile-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkInForTurns, checkOutOfTurns } from "@/lib/actions/rotation";
import {
  createStaff,
  resetTurnAction,
  toggleStaffActive,
  updateStaffRole,
} from "@/lib/actions/salon";
import { requireManager } from "@/lib/auth";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import {
  getCommissionRates,
  getFloorStatus,
  getStaff,
  getTeamSkills,
  getTechDeletionCheck,
  getTechProfile,
  getTodayCheckins,
} from "@/lib/queries";
import { ROLE_DESCRIPTION, ROLE_LABEL, SKILL_LABEL, type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Staff & techs — the roster, their roles, skills and today's check-in state. */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireManager();
  const { tab } = await searchParams;
  const view: "roster" | "skills" = tab === "skills" ? "skills" : "roster";
  const [staff, checkins, rates, floor, teamSkills] = await Promise.all([
    getStaff(),
    getTodayCheckins(),
    getCommissionRates(),
    getFloorStatus(),
    view === "skills" ? getTeamSkills() : Promise.resolve([]),
  ]);

  // The roster shows a Profile button per person; both the extended profile and
  // the "can this one be deleted?" answer are needed to render it honestly.
  const techs = staff.filter((person) => person.role === "tech");
  const extras =
    view === "roster"
      ? await Promise.all(
          techs.map(async (person) => ({
            id: person.id,
            profile: await getTechProfile(person.id),
            deletion: await getTechDeletionCheck(person.id),
          })),
        )
      : [];
  const extraById = new Map(extras.map((entry) => [entry.id, entry]));
  const houseRate = session.salon.tech_split_percent;

  // Pay periods are a length plus an anchor, so "current period" is arithmetic.
  const periodStart = currentPeriodStart(
    session.salon.pay_period_anchor,
    session.salon.pay_period_days,
  );
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + session.salon.pay_period_days - 1);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display">Team</h1>
          <p className="text-sm text-muted-foreground">
            {staff.length} on the roster · {techs.filter((t) => checkins.get(t.id)?.checked_out_at === null).length}{" "}
            checked in today
          </p>
        </div>
        <Link
          href="/dashboard"
          className="min-h-11 text-sm font-medium text-accent-default underline-offset-4 hover:underline"
        >
          Turn rotation →
        </Link>
      </header>

      {/*
        The live floor. This used to sit on the dashboard, where it filled the
        screen with cards an owner does not need while she is placing a client.
        Everything about staff belongs in one place, and this is it.
      */}
      <section aria-label="On the floor now" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title">On the floor now</h2>
          <span className="text-meta text-muted-text tabular-nums">
            {floor.filter((tech) => tech.is_checked_in).length} of {floor.length} checked in
          </span>
        </div>
        <TechRail techs={floor} />
      </section>

      {/* Two questions, two tabs: who is on the team, and who can do what. */}
      <nav className="flex gap-1 rounded-xl bg-surface-sunken p-1" aria-label="Team views">
        {(
          [
            { id: "roster", label: "Roster" },
            { id: "skills", label: "Skills" },
          ] as const
        ).map((entry) => (
          <Link
            key={entry.id}
            href={entry.id === "roster" ? "/staff" : `/staff?tab=${entry.id}`}
            aria-current={view === entry.id ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors",
              view === entry.id
                ? "bg-surface-overlay text-primary-text"
                : "text-muted-text hover:text-primary-text",
            )}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {view === "skills" ? (
        <section aria-label="Team skills" className="space-y-3">
          <p className="text-sm text-secondary-text">
            The rotation never offers work a tech has no skill for, so this list decides who gets
            which clients. Tap a cell to change one person, or select rows to change several.
          </p>
          <SkillsGrid rows={teamSkills} />
        </section>
      ) : (
        <>

      <Card className="edge-accent">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current pay period
            </p>
            <p className="font-semibold">
              {formatDate(periodStart.toISOString())} – {formatDate(periodEnd.toISOString())}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Length
            </p>
            <p className="font-semibold tabular-nums">{session.salon.pay_period_days} days</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Salon default rate
            </p>
            <p className="font-semibold tabular-nums">{houseRate}%</p>
          </div>
          <p className="text-xs text-muted-foreground">
            A tech with no rate of their own is paid the default. On a{" "}
            {formatMoney(100)} service that is {formatMoney(houseRate)}.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            Team
          </CardTitle>
          <CardDescription>
            Deactivate takes someone off the rotation and keeps their history. Deleting is only
            possible for someone with no completed services or payments — otherwise it would
            detach the money they took from the books.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {staff.map((person) => {
              const isSelf = person.id === session.userId;
              const checkin = checkins.get(person.id);
              const isCheckedIn = Boolean(checkin && !checkin.checked_out_at);

              return (
                <li key={person.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{person.full_name}</p>
                      {isSelf ? <Badge variant="secondary">You</Badge> : null}
                      {!person.is_active ? <Badge variant="cancelled">Inactive</Badge> : null}
                      {person.role === "tech" && person.is_active ? (
                        <Badge variant={isCheckedIn ? "completed" : "cancelled"}>
                          {isCheckedIn ? "On rotation" : "Not checked in"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[person.role]} · last turn {formatRelative(person.last_turn_at)}
                    </p>
                    {person.role === "tech" ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {person.skills.length > 0
                          ? person.skills.map((skill) => SKILL_LABEL[skill]).join(" · ")
                          : "No services set"}
                      </p>
                    ) : null}
                  </div>

                  {person.role === "tech" ? (
                    <div className="shrink-0">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Commission
                      </p>
                      <CommissionEditor
                        techId={person.id}
                        rate={rates.get(person.id) ?? null}
                        fallback={houseRate}
                      />
                    </div>
                  ) : null}

                  {isSelf ? null : (
                    <div className="w-32 shrink-0">
                      <ActionSelect
                        action={updateStaffRole}
                        fields={{ staff_id: person.id }}
                        name="role"
                        value={person.role}
                        aria-label={`Role for ${person.full_name}`}
                      >
                        {(Object.keys(ROLE_LABEL) as UserRole[]).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </ActionSelect>
                    </div>
                  )}

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {person.role === "tech" ? (
                      <TechProfileDialog
                        tech={person}
                        profile={extraById.get(person.id)?.profile ?? null}
                        deletion={extraById.get(person.id)?.deletion ?? null}
                      />
                    ) : null}
                    {person.role === "tech" && person.is_active ? (
                      <>
                        <ActionButton
                          action={isCheckedIn ? checkOutOfTurns : checkInForTurns}
                          fields={{ tech_id: person.id }}
                          variant={isCheckedIn ? "ghost" : "outline"}
                          size="sm"
                        >
                          {isCheckedIn ? "Check out" : "Check in"}
                        </ActionButton>
                        <ActionButton
                          action={resetTurnAction}
                          fields={{ staff_id: person.id }}
                          variant="ghost"
                          size="sm"
                        >
                          Reset turn
                        </ActionButton>
                      </>
                    ) : null}
                    <ActionButton
                      action={toggleStaffActive}
                      fields={{
                        staff_id: person.id,
                        is_active: person.is_active ? "false" : "true",
                      }}
                      variant={person.is_active ? "ghost" : "secondary"}
                      size="sm"
                      disabled={isSelf}
                    >
                      {person.is_active ? "Deactivate" : "Activate"}
                    </ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            Add someone
          </CardTitle>
          <CardDescription>{ROLE_DESCRIPTION.admin}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createStaff} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="staff_name">Full name</Label>
              <Input id="staff_name" name="full_name" required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff_email">Email</Label>
              <Input id="staff_email" name="email" type="email" required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff_password">Temporary password</Label>
              <Input
                id="staff_password"
                name="password"
                type="text"
                minLength={8}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff_role">Role</Label>
              <Select id="staff_role" name="role" defaultValue="tech">
                {(Object.keys(ROLE_LABEL) as UserRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton size="lg" className="w-full sm:w-auto">
                Add to salon
              </SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

        </>
      )}
    </div>
  );
}

/** Start of the pay period that contains today. */
function currentPeriodStart(anchorDate: string, lengthDays: number): Date {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  const today = new Date();
  const dayMs = 86_400_000;
  const elapsed = Math.floor((today.getTime() - anchor.getTime()) / dayMs);
  const periods = Math.floor(elapsed / lengthDays);
  return new Date(anchor.getTime() + periods * lengthDays * dayMs);
}
