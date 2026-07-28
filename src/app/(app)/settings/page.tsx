import Link from "next/link";
import { Scissors, Users } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateOwnName, updateSalon } from "@/lib/actions/salon";
import { requireManager } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Settings is now just the salon and your own account. Services, staff and
 * pay each earned their own page — this one stays short on purpose.
 */
export default async function SettingsPage() {
  const session = await requireManager();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Salon since {formatDate(session.salon.created_at)}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
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
          <CardHeader className="pb-3">
            <CardTitle>Your account</CardTitle>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Shortcut
          href="/services"
          icon={Scissors}
          title="Services & pricing"
          description="Menu, prices and the commission split."
        />
        <Shortcut
          href="/staff"
          icon={Users}
          title="Staff & techs"
          description="Roles, skills and daily check-ins."
        />
        <Shortcut
          href="/customers"
          icon={Users}
          title="Clients"
          description="Client records, phone numbers and notes."
        />
      </div>
    </div>
  );
}

function Shortcut({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="rounded-xl">
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardContent className="space-y-2 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-5" />
          </div>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
