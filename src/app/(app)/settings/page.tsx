import Link from "next/link";
import { Scissors, Users } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { AppearanceSettings } from "@/components/appearance-settings";
import { KioskDevices } from "@/components/kiosk/kiosk-devices";
import { BrandingCard } from "@/components/settings/branding-card";
import { DashboardDefaultForm } from "@/components/dashboard-default-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveTimezone } from "@/lib/actions/appearance";
import { updateOwnName, updateSalon } from "@/lib/actions/salon";
import { requireManager } from "@/lib/auth";
import { getKioskDevices } from "@/lib/queries";
import { resolveLayout, toStored } from "@/lib/dashboard";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Settings is now just the salon and your own account. Services, staff and
 * pay each earned their own page — this one stays short on purpose.
 */
export default async function SettingsPage() {
  const session = await requireManager();
  const { devices: kioskDevices, hasExitPin } = await getKioskDevices();

  // What this manager currently sees, ready to publish as the starting point
  // for anyone who has not arranged their own.
  const myLayout = toStored(
    resolveLayout(
      session.profile.dashboard_layout,
      session.salon.default_dashboard_layout,
      session.role,
    ),
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-display">Settings</h1>
        <p className="text-sm text-muted-text">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Two independent choices: the theme (the palette) and the mode (light or dark). Every
            theme is built for both.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceSettings salonTheme={session.salon.default_theme} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            Arrange your own on the Dashboard itself, under Customise. Publishing it here sets
            what a new manager or admin starts with — it never changes a dashboard someone has
            already arranged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DashboardDefaultForm layout={myLayout} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>The salon day</CardTitle>
          <CardDescription>
            When your day starts and ends. Turn check-ins, &ldquo;done today&rdquo; and the daily
            totals are all measured against this — if it is wrong, techs drop off the rotation
            mid-shift.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveTimezone} resetOnSuccess={false} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                name="timezone"
                defaultValue={session.salon.timezone}
                placeholder="America/New_York"
                required
              />
              <p className="text-meta text-muted-text">
                An IANA name, such as America/New_York or America/Los_Angeles.
              </p>
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

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
      <BrandingCard
        logoUrl={session.salon.logo_url}
        brandColor={session.salon.brand_color}
        slug={session.salon.slug}
      />
      <KioskDevices devices={kioskDevices} hasExitPin={hasExitPin} />

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
