"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { AlertCircle, ArrowLeft, Check, Clock, Delete, UserRound } from "lucide-react";

import { kioskCheckin, kioskLookup } from "@/lib/actions/kiosk";
import type { KioskCheckin, KioskLookup } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Idle before "Still there?", and the countdown on that prompt. */
const IDLE_MS = 60_000;
const COUNTDOWN_S = 15;
/** Wrong numbers before the screen stops answering and offers a walk-in. */
const MAX_MISSES = 3;

type Step =
  | { name: "idle" }
  | { name: "keypad"; digits: string; busy: boolean }
  | { name: "result"; lookup: Extract<KioskLookup, { result: "found" }>; busy: boolean }
  | { name: "success"; tech: string | null; ahead: number }
  | { name: "walkin"; reason: "no_appointment" | "no_match" }
  | { name: "problem"; message: string };

type State = { step: Step; misses: number };

type Action =
  | { type: "start" }
  | { type: "digit"; value: string }
  | { type: "backspace" }
  | { type: "busy" }
  | { type: "looked_up"; lookup: KioskLookup }
  | { type: "checked_in"; result: KioskCheckin }
  | { type: "back" }
  | { type: "reset" };

const IDLE: State = { step: { name: "idle" }, misses: 0 };

/**
 * The whole check-in journey as one reducer.
 *
 * A reducer rather than a pile of `useState` for one reason that matters more
 * here than anywhere else in the app: `reset` is a single assignment. The next
 * customer must never see a trace of the last one, and "clear seven pieces of
 * state and hope you remembered them all" is how a half-typed phone number
 * survives an idle timeout.
 *
 * `misses` deliberately survives a reset within a session — three wrong
 * numbers means someone is guessing, and starting over should not refill the
 * budget. It clears when a lookup actually succeeds.
 */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...state, step: { name: "keypad", digits: "", busy: false } };

    case "digit": {
      if (state.step.name !== "keypad" || state.step.busy) return state;
      if (state.step.digits.length >= 10) return state;
      return {
        ...state,
        step: { ...state.step, digits: state.step.digits + action.value },
      };
    }

    case "backspace": {
      if (state.step.name !== "keypad" || state.step.busy) return state;
      return { ...state, step: { ...state.step, digits: state.step.digits.slice(0, -1) } };
    }

    case "busy":
      if (state.step.name !== "keypad" && state.step.name !== "result") return state;
      return { ...state, step: { ...state.step, busy: true } };

    case "looked_up": {
      const { lookup } = action;

      if (lookup.result === "rate_limited") {
        return {
          ...state,
          step: {
            name: "problem",
            message: "Too many tries just now. Please see the front desk.",
          },
        };
      }

      if (lookup.result === "no_match") {
        const misses = state.misses + 1;
        // Never let someone sit here probing numbers. After three, the screen
        // stops being a lookup and becomes a walk-in form.
        if (misses >= MAX_MISSES) {
          return { step: { name: "walkin", reason: "no_match" }, misses };
        }
        return { step: { name: "keypad", digits: "", busy: false }, misses };
      }

      if (lookup.state === "no_appointment") {
        return { step: { name: "walkin", reason: "no_appointment" }, misses: 0 };
      }

      return { step: { name: "result", lookup, busy: false }, misses: 0 };
    }

    case "checked_in": {
      const { result } = action;
      if (result.result === "checked_in") {
        return { step: { name: "success", tech: result.tech_name, ahead: result.ahead }, misses: 0 };
      }
      return {
        ...state,
        step: {
          name: "problem",
          message:
            result.result === "already_checked_in"
              ? "You're already checked in — please take a seat."
              : result.result === "outside_window"
                ? "It's not quite time yet. Please see the front desk."
                : "Please see the front desk.",
        },
      };
    }

    case "back":
      return { ...state, step: { name: "keypad", digits: "", busy: false } };

    // One assignment. Nothing to forget.
    case "reset":
      return IDLE;
  }
}

export function KioskFlow({
  salonName,
  earlyMinutes,
}: {
  salonName: string;
  earlyMinutes: number;
  lateMinutes: number;
}) {
  const [state, dispatch] = useReducer(reducer, IDLE);
  const { step } = state;

  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const idleWarning = useIdleReset(step.name !== "idle", reset);

  // Auto-lookup the instant the tenth digit lands: nobody should have to find
  // a submit button on a screen they use once.
  const digits = step.name === "keypad" ? step.digits : "";
  const busy = step.name === "keypad" ? step.busy : false;

  useEffect(() => {
    if (digits.length !== 10 || busy) return;
    let cancelled = false;
    dispatch({ type: "busy" });
    kioskLookup(digits).then((lookup) => {
      if (!cancelled) dispatch({ type: "looked_up", lookup });
    });
    return () => {
      cancelled = true;
    };
  }, [digits, busy]);

  // Own the history. A back swipe on a tablet would otherwise walk out of the
  // app entirely; here it means "back one step in the flow".
  useEffect(() => {
    history.pushState({ kiosk: true }, "");
    const onPop = (event: PopStateEvent) => {
      event.preventDefault();
      history.pushState({ kiosk: true }, "");
      dispatch({ type: "back" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const confirm = async () => {
    if (step.name !== "result" || step.busy) return;
    dispatch({ type: "busy" });
    const result = await kioskCheckin(step.lookup.appointment!.id);
    dispatch({ type: "checked_in", result });
  };

  return (
    <>
      {idleWarning !== null ? (
        <IdlePrompt seconds={idleWarning} onStay={() => dispatch({ type: "back" })} />
      ) : null}

      {step.name === "idle" ? (
        <Idle salonName={salonName} onStart={() => dispatch({ type: "start" })} />
      ) : null}

      {step.name === "keypad" ? (
        <Keypad
          digits={step.digits}
          busy={step.busy}
          missed={state.misses > 0}
          onDigit={(value) => dispatch({ type: "digit", value })}
          onBackspace={() => dispatch({ type: "backspace" })}
          onCancel={reset}
        />
      ) : null}

      {step.name === "result" ? (
        <Confirm
          lookup={step.lookup}
          busy={step.busy}
          earlyMinutes={earlyMinutes}
          onConfirm={confirm}
          onCancel={reset}
        />
      ) : null}

      {step.name === "success" ? (
        <Success tech={step.tech} ahead={step.ahead} onDone={reset} />
      ) : null}

      {step.name === "walkin" ? <Walkin reason={step.reason} onDone={reset} /> : null}

      {step.name === "problem" ? <Problem message={step.message} onDone={reset} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function Idle({ salonName, onStart }: { salonName: string; onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center"
    >
      <span className="text-2xl text-secondary-text">Welcome to {salonName}</span>
      <span className="text-[clamp(3rem,10vw,6rem)] font-semibold leading-none tracking-tight">
        Tap to check in
      </span>
      <span className="text-xl text-muted-text">Chạm để nhận phòng</span>
    </button>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

function Keypad({
  digits,
  busy,
  missed,
  onDigit,
  onBackspace,
  onCancel,
}: {
  digits: string;
  busy: boolean;
  missed: boolean;
  onDigit: (value: string) => void;
  onBackspace: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-4">
      <p className="text-3xl font-semibold">What&apos;s your phone number?</p>

      {missed ? (
        <p className="text-lg text-warning">
          We didn&apos;t find that one. Give it another go.
        </p>
      ) : null}

      <p
        aria-live="polite"
        className="min-h-[4rem] font-mono text-[clamp(2rem,7vw,3.5rem)] tabular-nums tracking-[0.15em]"
      >
        {formatPhone(digits)}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, index) =>
          key === "" ? (
            <span key={index} />
          ) : (
            <button
              key={index}
              type="button"
              disabled={busy}
              onClick={() => (key === "⌫" ? onBackspace() : onDigit(key))}
              aria-label={key === "⌫" ? "Delete" : key}
              className={cn(
                // 72px keys: this is used standing up, one-handed, by someone
                // who has never seen it before.
                "flex size-[72px] items-center justify-center rounded-2xl border border-subtle bg-surface-raised text-3xl font-semibold transition-colors",
                "active:bg-accent-subtle disabled:opacity-40",
              )}
            >
              {key === "⌫" ? <Delete className="size-7" /> : key}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="min-h-14 px-6 text-lg font-medium text-muted-text"
      >
        Cancel
      </button>
    </div>
  );
}

function Confirm({
  lookup,
  busy,
  earlyMinutes,
  onConfirm,
  onCancel,
}: {
  lookup: Extract<KioskLookup, { result: "found" }>;
  busy: boolean;
  earlyMinutes: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (lookup.state === "no_appointment" || !lookup.appointment) return null;

  const { appointment } = lookup;
  const time = new Date(appointment.scheduled_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-4">
      <div className="w-full max-w-lg space-y-4 rounded-3xl border border-subtle bg-surface-raised p-8 text-center">
        <UserRound className="mx-auto size-10 text-accent-default" />
        {/* Masked: this screen faces a room full of strangers. */}
        <p className="text-4xl font-semibold">{lookup.client_name}</p>
        <p className="text-lg text-muted-text">{lookup.masked_phone}</p>

        <div className="space-y-1 border-t border-subtle pt-4">
          <p className="text-3xl font-semibold tabular-nums">{time}</p>
          <p className="text-xl text-secondary-text">{appointment.services}</p>
          {appointment.tech_name ? (
            <p className="text-lg text-muted-text">with {appointment.tech_name}</p>
          ) : null}
        </div>
      </div>

      {lookup.state === "ready" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="min-h-[88px] w-full max-w-lg rounded-2xl bg-accent-default text-3xl font-semibold text-on-accent disabled:opacity-60"
        >
          {busy ? "Checking you in…" : "Check in"}
        </button>
      ) : (
        <Notice
          icon={lookup.state === "already_checked_in" ? Check : Clock}
          tone={lookup.state === "already_checked_in" ? "success" : "warning"}
        >
          {lookup.state === "already_checked_in"
            ? "You're all set — please take a seat."
            : lookup.state === "already_done"
              ? "That visit is already finished."
              : lookup.state === "too_early"
                ? `Please check in within ${earlyMinutes} minutes of your appointment.`
                : "That appointment has passed — please see the front desk."}
        </Notice>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="min-h-14 px-6 text-lg font-medium text-muted-text"
      >
        <ArrowLeft className="mr-2 inline size-5" />
        Not you? Start over
      </button>
    </div>
  );
}

function Success({
  tech,
  ahead,
  onDone,
}: {
  tech: string | null;
  ahead: number;
  onDone: () => void;
}) {
  // Auto-clear: nobody taps "done" on a success screen, they walk away.
  useEffect(() => {
    const timer = setTimeout(onDone, 12_000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <button
      type="button"
      onClick={onDone}
      className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center"
    >
      <span className="flex size-24 items-center justify-center rounded-full bg-success-bg text-success">
        <Check className="size-14" />
      </span>
      <span className="text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-none">
        You&apos;re checked in
      </span>
      {tech ? <span className="text-2xl text-secondary-text">{tech} will be with you</span> : null}
      <span className="text-xl text-muted-text">
        {ahead === 0
          ? "You're next."
          : `${ahead} ${ahead === 1 ? "person is" : "people are"} ahead of you.`}
      </span>
      <span className="text-lg text-muted-text">Please take a seat · Mời ngồi</span>
    </button>
  );
}

/**
 * Walk-ins. A stub in this pass — the second pass turns this into a booking
 * flow. It exists now so that "no appointment" and "no match" already have
 * somewhere to land rather than a dead end.
 */
function Walkin({ reason, onDone }: { reason: "no_appointment" | "no_match"; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 15_000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <button
      type="button"
      onClick={onDone}
      className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center"
    >
      <span className="text-[clamp(2.5rem,7vw,4rem)] font-semibold leading-none">
        {reason === "no_appointment" ? "Nothing booked today" : "We'll get you set up"}
      </span>
      <span className="max-w-xl text-2xl text-secondary-text">
        Please see the front desk and they&apos;ll take care of you.
      </span>
      <span className="text-lg text-muted-text">Vui lòng gặp quầy lễ tân</span>
    </button>
  );
}

function Problem({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 12_000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <button
      type="button"
      onClick={onDone}
      className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center"
    >
      <AlertCircle className="size-16 text-warning" />
      <span className="max-w-xl text-[clamp(2rem,6vw,3rem)] font-semibold leading-tight">
        {message}
      </span>
    </button>
  );
}

function Notice({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Check;
  tone: "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex w-full max-w-lg items-center gap-3 rounded-2xl border px-6 py-5 text-xl",
        tone === "success"
          ? "border-success-border bg-success-bg text-success"
          : "border-warning-border bg-warning-bg text-warning",
      )}
    >
      <Icon className="size-7 shrink-0" />
      {children}
    </p>
  );
}

function IdlePrompt({ seconds, onStay }: { seconds: number; onStay: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-surface-canvas/95 px-8 text-center">
      <p className="text-5xl font-semibold">Still there?</p>
      <p className="text-2xl text-secondary-text">
        Starting over in <span className="tabular-nums">{seconds}</span>
      </p>
      <button
        type="button"
        onClick={onStay}
        className="min-h-[88px] rounded-2xl bg-accent-default px-12 text-2xl font-semibold text-on-accent"
      >
        I&apos;m still here
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Idle handling: 60s of nothing, then a 15s countdown, then a full reset.
 *
 * Returns the remaining seconds while the prompt is up, or null. Any pointer
 * or key event anywhere restarts the clock — including on the prompt itself,
 * which is why "I'm still here" only has to exist for people who are looking
 * at it rather than touching it.
 */
function useIdleReset(active: boolean, onReset: () => void): number | null {
  const [remaining, setRemaining] = useReducer(
    (_: number | null, next: number | null) => next,
    null,
  );
  const resetRef = useRef(onReset);
  resetRef.current = onReset;

  useEffect(() => {
    if (!active) {
      setRemaining(null);
      return;
    }

    let idleTimer: ReturnType<typeof setTimeout>;
    let tick: ReturnType<typeof setInterval> | undefined;

    const clearCountdown = () => {
      if (tick) clearInterval(tick);
      tick = undefined;
      setRemaining(null);
    };

    const startCountdown = () => {
      let left = COUNTDOWN_S;
      setRemaining(left);
      tick = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearCountdown();
          resetRef.current();
          return;
        }
        setRemaining(left);
      }, 1000);
    };

    const arm = () => {
      clearTimeout(idleTimer);
      clearCountdown();
      idleTimer = setTimeout(startCountdown, IDLE_MS);
    };

    arm();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, arm, { passive: true });

    return () => {
      clearTimeout(idleTimer);
      clearCountdown();
      for (const event of events) window.removeEventListener(event, arm);
    };
  }, [active]);

  return remaining;
}

/** "(555) 210-4477" as it is typed, so the number is readable at a glance. */
function formatPhone(digits: string): string {
  if (digits.length === 0) return "(•••) •••-••••";
  const area = digits.slice(0, 3);
  const mid = digits.slice(3, 6);
  const last = digits.slice(6, 10);
  let out = `(${area.padEnd(3, "•")})`;
  out += ` ${mid.padEnd(3, "•")}`;
  out += `-${last.padEnd(4, "•")}`;
  return out;
}
