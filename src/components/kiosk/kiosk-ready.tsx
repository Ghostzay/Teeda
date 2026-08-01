"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut, Play } from "lucide-react";

import { kioskSignOut } from "@/lib/actions/kiosk";
import { startKioskMode } from "@/lib/actions/kiosk-mode";
import { cn } from "@/lib/utils";

/**
 * Where a kiosk account lands after signing in.
 *
 * The screen that was unreachable: sign-in used to redirect past this straight
 * into the locked customer view, and with no PIN set the exit hatch was
 * disabled — a tablet locked with no way out. Arriving here means arriving as
 * staff holding a device.
 *
 * The exit steps are printed here, before anything is locked, because the
 * person who starts kiosk mode is often not the person who has to end it.
 */
export function KioskReady({
  salonName,
  deviceLabel,
  isActive,
  hasExitPin,
}: {
  salonName: string;
  deviceLabel: string;
  isActive: boolean;
  hasExitPin: boolean;
}) {
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
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-7 overflow-y-auto bg-surface-canvas px-8 py-10 text-center text-primary-text">
      <div className="space-y-2">
        <p className="text-2xl text-secondary-text">{salonName}</p>
        <p className="text-[clamp(2rem,6vw,3.5rem)] font-semibold leading-none">{deviceLabel}</p>
      </div>

      {!isActive ? (
        <p className="flex max-w-lg items-center gap-3 rounded-2xl border border-warning-border bg-warning-bg px-6 py-5 text-lg text-warning">
          <AlertTriangle className="size-6 shrink-0" />
          This tablet has been switched off. A manager can switch it back on in
          Settings.
        </p>
      ) : null}

      <ExitSteps hasExitPin={hasExitPin} />

      {error ? <p className="text-lg text-danger">{error}</p> : null}

      <button
        type="button"
        disabled={!isActive || !hasExitPin || busy}
        onClick={() => setConfirming(true)}
        className="flex min-h-[96px] items-center gap-4 rounded-3xl bg-accent-default px-12 text-3xl font-semibold text-on-accent disabled:bg-surface-overlay disabled:text-muted-text"
      >
        <Play className="size-8" />
        {busy ? "Starting…" : "Start kiosk mode"}
      </button>

      <button
        type="button"
        onClick={async () => {
          await kioskSignOut();
          router.replace("/login");
        }}
        className="inline-flex min-h-14 items-center gap-2 px-6 text-lg font-medium text-muted-text"
      >
        <LogOut className="size-5" />
        Sign out
      </button>

      {confirming ? (
        <KioskModeConfirm
          hasExitPin={hasExitPin}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={start}
        />
      ) : null}
    </div>
  );
}

/**
 * The exit steps, stated before anything is locked.
 *
 * Someone will forget. Printing it here and in the manager's device list is
 * cheaper than a support call from a salon with a bricked tablet.
 */
export function ExitSteps({ hasExitPin }: { hasExitPin: boolean }) {
  return (
    <div
      className={cn(
        "max-w-lg space-y-1 rounded-2xl border px-6 py-4 text-left",
        hasExitPin
          ? "border-subtle bg-surface-raised"
          : "border-danger-border bg-danger-bg",
      )}
    >
      <p className={cn("font-semibold", hasExitPin ? "" : "text-danger")}>
        {hasExitPin ? "To leave kiosk mode" : "No manager PIN is set"}
      </p>
      {hasExitPin ? (
        <ol className="list-decimal space-y-0.5 pl-5 text-secondary-text">
          <li>Tap the salon name, top-left, five times within three seconds.</li>
          <li>Enter the manager PIN.</li>
        </ol>
      ) : (
        <p className="text-danger">
          Kiosk mode cannot start until a manager sets one, in Settings →
          Check-in tablets. Without a PIN there is no way off this screen once
          it locks, so the server refuses to start it — this is not something
          the tablet can be talked into.
        </p>
      )}
    </div>
  );
}

/** States plainly what is about to happen, because it is hard to undo. */
function KioskModeConfirm({
  hasExitPin,
  busy,
  onCancel,
  onConfirm,
}: {
  hasExitPin: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-surface-canvas/95 p-8">
      <div className="w-full max-w-lg space-y-4 rounded-3xl border border-subtle bg-surface-raised p-7 text-left">
        <p className="text-title">Start kiosk mode?</p>
        <ul className="list-disc space-y-1.5 pl-5 text-secondary-text">
          <li>This device locks to the customer check-in screen.</li>
          <li>
            Everything else in Teeda becomes unreachable from this device —
            including the dashboard, the calendar and takings.
          </li>
          <li>It stays locked through a refresh, a restart and a reboot.</li>
        </ul>

        <ExitSteps hasExitPin={hasExitPin} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-14 flex-1 rounded-xl border border-subtle text-lg font-semibold text-secondary-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-14 flex-1 rounded-xl bg-accent-default text-lg font-semibold text-on-accent disabled:opacity-60"
          >
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
