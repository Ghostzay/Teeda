import { redirect } from "next/navigation";
import { LogOut, Sparkles } from "lucide-react";

import { AppNav } from "@/components/app-nav";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { getAuthUser, getSessionContext } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();

  if (!session) {
    const user = await getAuthUser();
    if (!user) redirect("/login");
    // Signed in with no salon: onboarding, not a dead end.
    redirect("/welcome");
  }

  const { profile, salon, isManager, canManageFloor, role } = session;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* One subscription for the whole shell — every screen stays live. */}
      <RealtimeRefresher salonId={salon.id} />

      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{salon.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.full_name} · {ROLE_LABEL[role]}
            </p>
          </div>

          <AppNav canManageFloor={canManageFloor} isManager={isManager} variant="desktop" />

          <form action={signOut}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      {/* pb leaves room for the mobile tab bar. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 sm:pb-8">{children}</main>

      <AppNav canManageFloor={canManageFloor} isManager={isManager} variant="mobile" />
    </div>
  );
}

