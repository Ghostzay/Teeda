import type { Metadata, Viewport } from "next";

import { SuspendedScreen } from "@/components/suspended-screen";
import { requireKiosk } from "@/lib/auth";

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
 * The kiosk subtree: authorisation, and nothing else.
 *
 * `requireKiosk()` runs here, not only in the middleware. Middleware is a
 * redirect that runs on a matcher; this runs on the render path, so there is no
 * route into this subtree that skips it. Any other role that reaches /kiosk is
 * sent back to its own home before a single child renders.
 *
 * The customer-facing chrome used to live here too, which meant the lobby at
 * /kiosk/home inherited it — including the hidden exit hatch, on the very
 * screen you reach by using that hatch. It now belongs to /kiosk, the only
 * screen that wants it.
 *
 * Nothing from the app shell is imported anywhere under here: no nav, no
 * sidebar, no user menu. Not hidden with CSS — absent.
 */
export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  const session = await requireKiosk();
  // A paused salon's tablet says so instead of taking check-ins.
  if (session.salon.suspended_at) {
    return <SuspendedScreen salonName={session.salon.name} />;
  }
  return <>{children}</>;
}
