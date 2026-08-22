import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MobileNav, Sidebar } from "@/components/app-nav";
import { ZolvoraMark } from "@/components/brand";
import { BrandAccent } from "@/components/brand-accent";
import { AppFrame } from "@/components/app-frame";
import { EntryReveal } from "@/components/entry-reveal";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { SuspendedScreen } from "@/components/suspended-screen";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { UserMenu } from "@/components/user-menu";
import { signOut } from "@/lib/actions/auth";
import { getAuthUser, getSessionContext } from "@/lib/auth";
import { ENTRY_COOKIE, entryDayKey, shouldPlayEntry } from "@/lib/entry";
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

  // A suspended salon keeps its data and loses its floor. The platform admin
  // passes so support can still look inside while it is paused.
  if (salon.suspended_at && session.realRole !== "super_admin") {
    return <SuspendedScreen salonName={salon.name} />;
  }

  // The entry sequence, decided here so the overlay ships in the HTML: no
  // flash of dashboard first, and the per-user-per-day rule is enforced where
  // the user is actually known. Staff app only — the kiosk never plays it.
  const dayKey = entryDayKey(salon.timezone);
  const playEntry = shouldPlayEntry(
    (await cookies()).get(ENTRY_COOKIE)?.value,
    session.userId,
    dayKey,
  );

  return (
    <EntryReveal play={playEntry} userId={session.userId} dayKey={dayKey}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <BrandAccent color={salon.brand_color} />
        {session.impersonating ? <ImpersonationBanner salonName={salon.name} /> : null}
        <div className="flex min-h-0 flex-1">
        {/* One subscription for the whole shell — every screen stays live. */}
        <RealtimeRefresher salonId={salon.id} />

        <Sidebar role={role} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-subtle bg-surface-sunken px-4">
            <div
              data-brand-tile
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-default text-on-accent"
            >
              <ZolvoraMark className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-semibold leading-tight">{salon.name}</p>
              <p className="truncate text-meta text-muted-text">{ROLE_LABEL[role]}</p>
            </div>

            {/* Appearance lives in here too: a tech on a shared tablet can change
                the theme without needing access to Settings. */}
            <UserMenu
              name={profile.full_name}
              role={ROLE_LABEL[role]}
              salon={salon.name}
              signOut={signOut}
            />
          </header>

          {/*
            The frame owns the height; each page decides what scrolls inside it.
            That's what keeps a dashboard from turning into a long scroll.
          */}
          <main className="panel-scroll flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-8">
            <AppFrame>{children}</AppFrame>
          </main>
        </div>

          <MobileNav role={role} />
        </div>
      </div>
    </EntryReveal>
  );
}
