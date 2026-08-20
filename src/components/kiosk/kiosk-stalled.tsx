"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useTapGesture } from "@/components/kiosk/use-tap-gesture";
import { clearStalledKiosk, refreshKioskSession } from "@/lib/actions/kiosk-mode";

/**
 * "Please notify staff."
 *
 * The three things this screen must not be: a login form, a stack trace, or
 * white. It is a customer-facing surface in somebody's reception, and the only
 * useful thing it can say to the person looking at it is who to tell.
 *
 * It keeps trying in the background. A dropped connection, a Supabase blip and
 * a genuinely expired token all land here, and the first two heal on their own
 * — so a retry every thirty seconds means the tablet is usually back before
 * anyone has finished walking over to it.
 *
 * The five-tap gesture still works, because a tablet you cannot recover without
 * clearing its browser storage is a tablet somebody factory-resets. It asks for
 * no PIN: the PIN stops a customer stepping out of the kiosk into a live staff
 * session, and there is no session here to step into. Tapping through leads to
 * a login form and no further — precisely as far as the same person gets on
 * their own phone.
 */
export function KioskStalled({
  salonName,
  deviceLabel,
}: {
  salonName: string | null;
  deviceLabel: string | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  // The same gesture as the locked screen, from the same hook, so learning it
  // once is learning it everywhere.
  const tap = useTapGesture(useCallback(() => setAsking(true), []));

  // Retry, quietly. No spinner and no countdown: this is read from across a
  // room by somebody who is not waiting on it.
  useEffect(() => {
    let cancelled = false;

    const attempt = async () => {
      const alive = await refreshKioskSession();
      if (alive && !cancelled) router.replace("/kiosk");
    };

    void attempt();
    const timer = setInterval(attempt, 30_000);
    // A tablet that has been asleep wakes with a stale idea of everything.
    const onWake = () => void attempt();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 flex select-none flex-col items-center justify-center gap-6 overflow-hidden bg-surface-canvas px-8 text-center text-primary-text"
      style={{ touchAction: "manipulation", WebkitUserSelect: "none" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* The exit gesture, on the salon name, in the same place as always. */}
      <button
        type="button"
        onClick={tap}
        aria-label={salonName ?? "Salon"}
        className="text-2xl text-secondary-text"
      >
        {salonName ?? "Zolvora"}
      </button>

      {/* Both languages, statically — this screen has no session, no state and
          no business asking anyone to find a toggle. */}
      <p className="text-[clamp(2rem,6vw,3.5rem)] font-semibold leading-tight">
        Please notify staff
      </p>
      <p className="text-2xl text-secondary-text">Vui lòng báo nhân viên</p>
      <p className="max-w-xl text-xl text-secondary-text">
        This tablet needs attention before it can take check-ins. Someone at the
        desk will sort it out.
      </p>

      {deviceLabel ? (
        <p className="text-meta uppercase tracking-widest text-muted-text">{deviceLabel}</p>
      ) : null}

      {asking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-canvas/95 p-8">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-subtle bg-surface-raised p-6 text-left">
            <p className="text-title">Staff only</p>
            <p className="text-sm text-secondary-text">
              This tablet is signed out. Signing in again on the kiosk account
              puts it back on the check-in screen. Kiosk mode will need starting
              again afterwards.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="min-h-14 flex-1 rounded-xl border border-subtle text-lg font-semibold text-secondary-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clearStalledKiosk();
                  router.replace("/login");
                }}
                className="min-h-14 flex-1 rounded-xl bg-accent-default text-lg font-semibold text-on-accent"
              >
                Sign in again
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
