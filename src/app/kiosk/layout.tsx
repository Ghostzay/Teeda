import type { Metadata, Viewport } from "next";

import { KioskShell } from "@/components/kiosk/kiosk-shell";
import { requireKiosk } from "@/lib/auth";
import { kioskContext } from "@/lib/actions/kiosk";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check in",
  // A device in a waiting room has no business in anybody's search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Fills the notch area on a wall-mounted tablet rather than letterboxing.
  viewportFit: "cover",
};

/**
 * The kiosk shell.
 *
 * `requireKiosk()` runs here, not only in the middleware. Middleware is a
 * redirect that runs on a matcher; this runs on the render path, so there is
 * no route into this subtree that skips it. Any other role that reaches /kiosk
 * is sent back to its own home before a single child renders.
 *
 * Nothing from the app shell is imported: no nav, no sidebar, no user menu, no
 * sign-out. Not hidden with CSS — absent. A customer holding the tablet cannot
 * reach what was never rendered.
 */
export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  const session = await requireKiosk();
  const context = await kioskContext();

  return (
    <KioskShell
      salonName={context?.salon_name ?? session.salon.name}
      deviceLabel={context?.device_label ?? "Kiosk"}
      hasExitPin={context?.has_exit_pin ?? false}
    >
      {children}
    </KioskShell>
  );
}
