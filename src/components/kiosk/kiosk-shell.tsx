"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";

import { useTapGesture } from "@/components/kiosk/use-tap-gesture";
import { exitKioskMode, refreshKioskSession } from "@/lib/actions/kiosk-mode";
import { KioskLangProvider, useKioskText, type KioskLang } from "@/lib/kiosk-i18n";
import { cn } from "@/lib/utils";

/**
 * The chrome around the kiosk: the salon's name, the offline banner, and the
 * hidden way out. Deliberately thin — the flow inside owns all the state.
 *
 * The hardening here is the kind that only matters on a device a stranger is
 * holding: no text selection, no long-press menu, no rubber-band scroll, no
 * double-tap zoom. Each of those is a way to find an edge of the app that was
 * not designed to be found.
 */
export function KioskShell({
  salonName,
  deviceLabel,
  children,
}: {
  salonName: string;
  deviceLabel: string;
  children: React.ReactNode;
}) {
  return (
    <KioskLangProvider>
      <KioskShellInner salonName={salonName} deviceLabel={deviceLabel}>
        {children}
      </KioskShellInner>
    </KioskLangProvider>
  );
}

function KioskShellInner({
  salonName,
  deviceLabel,
  children,
}: {
  salonName: string;
  deviceLabel: string;
  children: React.ReactNode;
}) {
  const online = useOnline();
  const { t } = useKioskText();
  useSessionKeeper();

  return (
    <div
      className="fixed inset-0 flex select-none flex-col overflow-hidden bg-surface-canvas text-primary-text"
      style={{
        // Kill the 300ms double-tap delay without disabling scroll entirely.
        touchAction: "manipulation",
        // No rubber-banding at the edges: on a wall tablet it looks broken.
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {!online ? (
        <div
          role="status"
          className="flex items-center justify-center gap-3 bg-warning-bg px-6 py-3 text-warning"
        >
          <WifiOff className="size-5 shrink-0" />
          <span className="text-lg font-semibold">{t.offline}</span>
        </div>
      ) : null}

      <header className="flex items-center justify-between gap-4 px-8 pt-8">
        <ExitHatch salonName={salonName} />
        <div className="flex items-center gap-4">
          <LangToggle />
          <span className="text-meta uppercase tracking-widest text-muted-text">{deviceLabel}</span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

/**
 * The customer's language, as a visible control rather than a buried setting.
 * Native names on the buttons — "Tiếng Việt" is findable by the person who
 * needs it in a way a flag or the word "Vietnamese" is not.
 */
function LangToggle() {
  const { lang, setLang } = useKioskText();
  const options: { value: KioskLang; label: string }[] = [
    { value: "en", label: "English" },
    { value: "vi", label: "Tiếng Việt" },
  ];

  return (
    <div className="flex rounded-full border border-subtle bg-surface-raised p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLang(option.value)}
          className={cn(
            "min-h-11 rounded-full px-4 text-base font-semibold transition-colors",
            lang === option.value ? "bg-accent-default text-on-accent" : "text-secondary-text",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Five taps on the salon name, then a manager's PIN.
 *
 * Hidden rather than absent because a device with no way out is a device that
 * gets factory reset when it needs an update. Five taps is above what anybody
 * does by accident and below what anybody does by accident twice.
 *
 * The PIN is compared in SQL: this component only ever learns yes or no.
 */
function ExitHatch({ salonName }: { salonName: string }) {
  const router = useRouter();
  const { t } = useKioskText();
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Three seconds from the first tap, not from the last. See use-tap-gesture.
  const tap = useTapGesture(useCallback(() => setAsking(true), []));

  const submit = async () => {
    setBusy(true);
    setMessage(null);

    const result = await exitKioskMode(pin);
    setPin("");

    if (result.result === "ok") {
      // Straight to where this session actually belongs. A kiosk account goes
      // back to its ready screen; a manager gets their dashboard, because the
      // downgrade is over and `realRole` is what it always was.
      router.replace(result.to);
      return;
    }

    setBusy(false);
    setMessage(
      result.result === "locked_out"
        ? t.lockedOut
        : result.result === "no_pin"
          ? t.noPinSet
          : // Never "two attempts left" — that is help for somebody guessing.
            t.wrongPin,
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={tap}
        aria-label={salonName}
        className="text-left text-lg font-semibold tracking-tight text-muted-text"
      >
        {salonName}
      </button>

      {asking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-canvas/95 p-8">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-subtle bg-surface-raised p-6">
            <p className="text-title">{t.managerPin}</p>
            <p className="text-sm text-muted-text">{t.leavesKiosk}</p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-subtle bg-surface-sunken px-4 py-3 text-center text-2xl tracking-[0.5em] text-primary-text"
            />
            {message ? <p className="text-sm text-danger">{message}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  setPin("");
                  setMessage(null);
                }}
                className="min-h-14 flex-1 rounded-xl border border-subtle text-lg font-semibold text-secondary-text"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={busy || pin.length < 4}
                onClick={submit}
                className={cn(
                  "min-h-14 flex-1 rounded-xl text-lg font-semibold",
                  busy || pin.length < 4
                    ? "bg-surface-overlay text-muted-text"
                    : "bg-accent-default text-on-accent",
                )}
              >
                {busy ? t.checking : t.exitKiosk}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Rotate the auth token on a device that never navigates.
 *
 * The middleware refreshes the session on every request, which covers the whole
 * app except the one screen that makes no requests: a tablet left on the idle
 * greeting for a week. Its refresh token quietly expires, and the next customer
 * to touch it gets bounced to a login form.
 *
 * Ten minutes is well inside Supabase's default one-hour access token, so a
 * missed beat or two changes nothing. Also fires when the tablet wakes or the
 * network returns — the two moments a device is most likely to be holding a
 * token that expired while it was asleep.
 *
 * If the session cannot be recovered, this does not retry into a login form; it
 * routes to the branded stalled screen, which keeps trying on its own.
 */
function useSessionKeeper() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      if (document.visibilityState === "hidden") return;
      const alive = await refreshKioskSession();
      if (!alive && !cancelled) router.replace("/kiosk-stalled");
    };

    const timer = setInterval(beat, 10 * 60 * 1000);
    const onWake = () => void beat();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [router]);
}

/** Online/offline, so the screen can say so instead of going white. */
function useOnline() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
