import { KioskReady } from "@/components/kiosk/kiosk-ready";
import { kioskAccount } from "@/lib/actions/kiosk";
import { touchKioskSignIn } from "@/lib/actions/kiosk-mode";
import { requireKiosk } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Where a kiosk account lands after signing in.
 *
 * Not the customer-facing screen. Signing in used to drop straight into kiosk
 * mode, which meant there was no moment where the person holding the tablet was
 * a member of staff — they signed in and immediately lost the ability to do
 * anything but check somebody in.
 *
 * This is that moment: confirm the device, then start.
 */
export default async function KioskReadyPage() {
  const session = await requireKiosk();
  const account = await kioskAccount();
  // Stamp the device's last sign-in so the manager list can show it.
  await touchKioskSignIn();

  return (
    <KioskReady
      salonName={account?.salon_name ?? session.salon.name}
      deviceLabel={account?.device_label ?? session.profile.full_name}
      isActive={account?.is_active ?? false}
      hasExitPin={account?.has_exit_pin ?? false}
    />
  );
}
