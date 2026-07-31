"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut, Play } from "lucide-react";

import { kioskSignOut } from "@/lib/actions/kiosk";

/**
 * The kiosk's staff-facing screen: start the session, or hand the tablet back.
 *
 * Deliberately the only place a kiosk account can sign out. Once kiosk mode
 * starts, getting back here needs the manager PIN — so "sign out" is behind
 * that gate too, without the kiosk screen itself having to carry a sign-out
 * button a customer could find.
 */
export function KioskLobby({
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

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 bg-surface-canvas px-8 text-center text-primary-text">
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

      {!hasExitPin ? (
        <p className="max-w-lg text-base text-muted-text">
          No manager PIN is set. Once kiosk mode starts there will be no way out
          of it on this device — ask a manager to set one in Settings first.
        </p>
      ) : null}

      <button
        type="button"
        disabled={!isActive}
        onClick={() => router.replace("/kiosk")}
        className="flex min-h-[96px] items-center gap-4 rounded-3xl bg-accent-default px-12 text-3xl font-semibold text-on-accent disabled:bg-surface-overlay disabled:text-muted-text"
      >
        <Play className="size-8" />
        Start kiosk mode
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
    </div>
  );
}
