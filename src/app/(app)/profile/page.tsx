import { CheckInCard } from "@/components/checkin-card";
import { SkillsEditor } from "@/components/skills-editor";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateOwnName } from "@/lib/actions/salon";
import { requireSession } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { amICheckedIn } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A tech's own profile: their name, the services they offer, today's status. */
export default async function ProfilePage() {
  const session = await requireSession();
  const isCheckedIn = await amICheckedIn();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profile &amp; skills</h1>
        <p className="text-sm text-muted-foreground">
          {ROLE_LABEL[session.role]} at {session.salon.name} · last turn{" "}
          {formatRelative(session.profile.last_turn_at)}
        </p>
      </header>

      {session.isTech ? <CheckInCard isCheckedIn={isCheckedIn} /> : null}

      <SkillsEditor skills={session.profile.skills} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Your details</CardTitle>
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
  );
}
