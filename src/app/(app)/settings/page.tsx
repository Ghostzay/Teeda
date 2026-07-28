import { UserPlus } from "lucide-react";

import { ActionButton, ActionSelect } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createStaff,
  resetTurnAction,
  toggleStaffActive,
  updateOwnName,
  updateSalon,
  updateStaffRole,
} from "@/lib/actions/salon";
import { requireManager } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { getStaff } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireManager();
  const staff = await getStaff();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Salon details and who works the floor.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Salon</CardTitle>
            <CardDescription>Shown in the header on every device.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateSalon} resetOnSuccess={false} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="salon_name">Salon name</Label>
                <Input id="salon_name" name="name" defaultValue={session.salon.name} required />
              </div>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>{session.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateOwnName} resetOnSuccess={false} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="own_name">Your name</Label>
                <Input
                  id="own_name"
                  name="full_name"
                  defaultValue={session.profile.full_name}
                  required
                />
              </div>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            Add a technician
          </CardTitle>
          <CardDescription>
            Creates a login for this salon. Share the password with them — they can change it later.
          </CardDescription>
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
                <option value="tech">Tech</option>
                <option value="manager">Manager</option>
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

      <Card>
        <CardHeader>
          <CardTitle>Team ({staff.length})</CardTitle>
          <CardDescription>
            Deactivate a tech to take them off the rotation without deleting anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {staff.map((person) => {
              const isSelf = person.id === session.userId;

              return (
                <li key={person.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{person.full_name}</p>
                      {isSelf ? <Badge variant="secondary">You</Badge> : null}
                      {!person.is_active ? <Badge variant="cancelled">Off rotation</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {person.role === "manager" ? "Manager" : "Tech"} · last turn{" "}
                      {formatRelative(person.last_turn_at)}
                    </p>
                  </div>

                  {/* A manager can't demote themselves out of the salon. */}
                  {isSelf ? null : (
                    <div className="w-32 shrink-0">
                      <ActionSelect
                        action={updateStaffRole}
                        fields={{ staff_id: person.id }}
                        name="role"
                        value={person.role}
                        aria-label={`Role for ${person.full_name}`}
                      >
                        <option value="tech">Tech</option>
                        <option value="manager">Manager</option>
                      </ActionSelect>
                    </div>
                  )}

                  <div className="flex shrink-0 gap-2">
                    {person.role === "tech" ? (
                      <ActionButton
                        action={resetTurnAction}
                        fields={{ staff_id: person.id }}
                        variant="outline"
                        size="sm"
                      >
                        Reset turn
                      </ActionButton>
                    ) : null}
                    <ActionButton
                      action={toggleStaffActive}
                      fields={{ staff_id: person.id, is_active: person.is_active ? "false" : "true" }}
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
    </div>
  );
}
