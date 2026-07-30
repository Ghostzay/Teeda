import { KioskFlow } from "@/components/kiosk/kiosk-flow";
import { requireKiosk } from "@/lib/auth";
import { kioskContext, kioskServices } from "@/lib/actions/kiosk";

export const dynamic = "force-dynamic";

/**
 * Check in.
 *
 * The layout has already established that the caller is a kiosk; this repeats
 * the check because a page is reachable on its own render path and a guard
 * that lives only in a parent is a guard with a hole in it the first time
 * someone adds a route.
 */
export default async function KioskPage() {
  const session = await requireKiosk();
  const [context, services] = await Promise.all([kioskContext(), kioskServices()]);

  return (
    <KioskFlow
      salonName={context?.salon_name ?? session.salon.name}
      earlyMinutes={context?.early_minutes ?? 30}
      lateMinutes={context?.late_minutes ?? 20}
      services={services}
    />
  );
}
