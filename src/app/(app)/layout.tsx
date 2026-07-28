import { redirect } from "next/navigation";
import { LogOut, Sparkles } from "lucide-react";

import { MobileNav, Sidebar } from "@/components/app-nav";
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

  const { profile, salon, role } = session;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* One subscription for the whole shell — every screen stays live. */}
      <RealtimeRefresher salonId={salon.id} />

      <Sidebar role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-border bg-ink px-4 text-ink-foreground">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{salon.name}</p>
            <p className="truncate text-xs text-ink-muted">
              {profile.full_name} · {ROLE_LABEL[role]}
            </p>
          </div>

          <form action={signOut}>
            <Button
              variant="ghost"
              size="icon"
              type="submit"
              aria-label="Sign out"
              className="text-ink-muted hover:bg-ink-accent hover:text-ink-foreground"
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </header>

        {/*
          The frame owns the height; each page decides what scrolls inside it.
          That's what keeps a dashboard from turning into a long scroll.
        */}
        <main className="panel-scroll flex-1 px-4 pb-24 pt-4 md:pb-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <MobileNav role={role} />
    </div>
  );
}
