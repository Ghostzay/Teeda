import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";

import { KioskStalled } from "@/components/kiosk/kiosk-stalled";
import { KIOSK_BRAND_COOKIE, readKioskBrand } from "@/lib/kiosk-mode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Please notify staff",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * What a tablet shows when its session is gone.
 *
 * Outside `/kiosk` on purpose: that whole segment is behind `requireKiosk()`,
 * which sends a request with no session to /login — and a login form on a
 * salon's reception tablet is the failure this screen replaces. Nothing here
 * reads the database, because there is no session left to read it with. The
 * salon's name comes from a cookie written when kiosk mode started, back when
 * there still was one.
 */
export default async function KioskStalledPage() {
  const brand = readKioskBrand((await cookies()).get(KIOSK_BRAND_COOKIE)?.value);

  return (
    <KioskStalled
      salonName={brand?.salonName ?? null}
      deviceLabel={brand?.deviceLabel ?? null}
    />
  );
}
