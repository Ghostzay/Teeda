import { redirect } from "next/navigation";

import { ZolvoraLogo } from "@/components/brand";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/actions/auth";
import { getAuthUser, getSessionContext } from "@/lib/auth";
import { homeForRole } from "@/lib/navigation";
import { WelcomeForm } from "./welcome-form";

/**
 * Onboarding for a signed-in user who has no salon yet — a first-time owner,
 * or anyone whose account was created before the schema existed. Creating the
 * salon here drops them straight into the management console.
 */
export default async function WelcomePage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // Already set up — nothing to do here.
  const session = await getSessionContext();
  if (session) redirect(homeForRole(session.role));

  const metadata = (user.user_metadata ?? {}) as { full_name?: string; salon_name?: string };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <ZolvoraLogo size={72} priority />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Set up your salon</h1>
            <p className="text-sm text-muted-foreground">
              One step and your management console is ready.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your salon</CardTitle>
            <CardDescription>
              You&apos;ll be the manager. Add your technicians afterwards from Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WelcomeForm
              defaultSalonName={metadata.salon_name ?? ""}
              defaultFullName={metadata.full_name ?? ""}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-muted-foreground">
            Joining a salon that already exists? Ask your manager to add {user.email} from their
            Settings page, then sign in again.
          </p>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
