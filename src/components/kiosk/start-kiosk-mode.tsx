"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tablet } from "lucide-react";

import { ExitSteps } from "@/components/kiosk/kiosk-ready";
import { Button } from "@/components/ui/button";
import { startKioskMode } from "@/lib/actions/kiosk-mode";

/**
 * Lock this device to the customer screen, from anywhere in the app.
 *
 * The important part is not this button — it is that `startKioskMode()`
 * downgrades the session on the server. A manager who taps this is a kiosk from
 * the next request onward: `requireManager()` turns them away, `canManageFloor`
 * is false, and the RLS underneath every query is the kiosk's. Typing /dashboard
 * into the address bar gets a redirect, and forcing past the redirect gets no
 * data. Hiding the nav would only be theatre.
 */
export function StartKioskModeButton({ hasExitPin }: { hasExitPin: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const result = await startKioskMode();
    if (!result.ok) {
      setError(result.error ?? "Couldn't start kiosk mode.");
      setBusy(false);
      return;
    }
    router.replace("/kiosk");
  };

  return (
    <>
      <Button
        variant="ghost"
        type="button"
        className="w-full justify-start"
        onClick={() => setConfirming(true)}
      >
        <Tablet className="size-4" />
        Start kiosk mode
      </Button>

      {confirming ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-surface-canvas/95 p-6">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-subtle bg-surface-raised p-6 text-left">
            <p className="text-title">Start kiosk mode on this device?</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-secondary-text">
              <li>This device locks to the customer check-in screen.</li>
              <li>
                Everything else in Teeda becomes unreachable from this device —
                the dashboard, the calendar and takings included. Not hidden:
                unreachable.
              </li>
              <li>It stays locked through a refresh, a restart and a reboot.</li>
              <li>Your own account is unaffected anywhere else.</li>
            </ul>

            <ExitSteps hasExitPin={hasExitPin} />

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button type="button" className="flex-1" disabled={busy} onClick={start}>
                {busy ? "Starting…" : "Start kiosk mode"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
