"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Loader2, Sparkles, UserRound } from "lucide-react";

import { kioskBook, kioskRegister, kioskSlots, kioskTechs } from "@/lib/actions/kiosk";
import { formatMoney } from "@/lib/format";
import { useKioskText } from "@/lib/kiosk-i18n";
import { displacedBy, isBasketValid, toggleService } from "@/lib/services";
import type {
  KioskBooking,
  KioskService,
  KioskSlot,
  KioskTechOption,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type BookingIdentity = { customerId: string; displayName: string };

type Step = "services" | "tech" | "time" | "booked";

/**
 * Walk-in booking.
 *
 * Every constraint on this screen comes from the database. The menu is the
 * `services` table, so retiring a service removes it from the tablet with no
 * deploy. The tech list is `kiosk_available_techs`, so somebody not on shift is
 * never rendered and then filtered — they are never fetched. The times are
 * `kiosk_available_slots`, which is the only thing in the system that decides
 * when something can happen.
 *
 * Nothing here computes a duration, a price, or an opening. It renders answers.
 */
export function KioskBookingFlow({
  identity,
  services,
  onDone,
  onCancel,
}: {
  identity: BookingIdentity;
  services: KioskService[];
  onDone: (booking: Extract<KioskBooking, { result: "booked" }>) => void;
  onCancel: () => void;
}) {
  const { t } = useKioskText();
  const [step, setStep] = useState<Step>("services");
  const [basket, setBasket] = useState<KioskService[]>([]);
  const [techs, setTechs] = useState<KioskTechOption[] | null>(null);
  // null is a real choice here — "first available", pinned and preselected.
  const [techId, setTechId] = useState<string | null>(null);
  const [slots, setSlots] = useState<KioskSlot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [collision, setCollision] = useState(false);

  const serviceIds = basket.map((item) => item.id);
  const total = basket.reduce((sum, item) => sum + Number(item.price), 0);
  const minutes = basket.reduce((sum, item) => sum + item.duration_minutes, 0);

  // Ask the server who can do it, the moment the basket is settled.
  useEffect(() => {
    if (step !== "tech" || serviceIds.length === 0) return;
    let cancelled = false;
    setTechs(null);
    kioskTechs(serviceIds).then((rows) => {
      if (!cancelled) setTechs(rows);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, serviceIds.join(",")]);

  const loadSlots = async () => {
    setSlots(null);
    setSlots(await kioskSlots(serviceIds, techId));
  };

  useEffect(() => {
    if (step !== "time") return;
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, techId]);

  const book = async (slot: KioskSlot) => {
    setBusy(true);
    setCollision(false);

    const result = await kioskBook({
      customerId: identity.customerId,
      serviceIds,
      // "First available" sends no tech and lets the RPC pick, so the choice is
      // made where the data is rather than from a list that may already be stale.
      techId: techId ?? slot.tech_id,
      startsAt: slot.slot_at,
    });

    setBusy(false);

    if (result.result === "booked") {
      onDone(result);
      return;
    }

    // Somebody won the race. Redrawing is the only correct response — a retry
    // would just lose again, and a silent failure would send them to a chair
    // that is not theirs.
    setCollision(true);
    await loadSlots();
  };

  // ---- Services ----------------------------------------------------------
  if (step === "services") {
    const grouped = groupByCategory(services);
    return (
      <Screen
        title={t.whatAreYouHaving}
        subtitle={identity.displayName}
        onBack={onCancel}
        footer={
          <Footer
            left={
              basket.length > 0
                ? t.selectedSummary(basket.length, minutes)
                : t.chooseAtLeastOne
            }
            right={basket.length > 0 ? formatMoney(total) : ""}
            action={t.continue_}
            disabled={basket.length === 0 || !isBasketValid(basket)}
            onAction={() => setStep("tech")}
          />
        }
      >
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <p className="text-lg font-semibold uppercase tracking-wide text-muted-text">
                {t.category[category]}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((service) => {
                  const on = basket.some((item) => item.id === service.id);
                  const swaps = displacedBy(basket, service);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setBasket((current) => toggleService(current, service))}
                      className={cn(
                        "flex min-h-[76px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                        on
                          ? "border-accent-default bg-accent-subtle"
                          : "border-subtle bg-surface-raised",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-[0.375rem] border",
                          on
                            ? "border-transparent bg-accent-default text-on-accent"
                            : "border-strong",
                        )}
                      >
                        {on ? <Check className="size-5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xl font-medium">{service.name}</span>
                        <span className="block text-base text-muted-text">
                          {t.minutesShort(service.duration_minutes)}
                          {swaps ? t.replaces(swaps.name) : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xl font-semibold tabular-nums">
                        {formatMoney(service.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Screen>
    );
  }

  // ---- Tech --------------------------------------------------------------
  if (step === "tech") {
    return (
      <Screen
        title={t.whoWouldYouLike}
        subtitle={basket.map((item) => item.name).join(" + ")}
        onBack={() => setStep("services")}
        footer={
          <Footer
            left={techs === null ? "" : t.availableNow(techs.length)}
            right=""
            action={t.continue_}
            disabled={techs === null || (techs.length === 0 && techId !== null)}
            onAction={() => setStep("time")}
          />
        }
      >
        {techs === null ? (
          <Spinner label={t.checkingWhosFree} />
        ) : techs.length === 0 ? (
          <Empty title={t.nobodyToday} body={t.nobodyTodayBody} />
        ) : (
          <div className="space-y-2">
            {/* Pinned and preselected: the fair default, and the one most
                likely to get them seated soonest. */}
            <TechRow
              name={t.firstAvailable}
              detail={soonest(techs, t.fromTime)}
              icon={<Sparkles className="size-6" />}
              selected={techId === null}
              onSelect={() => setTechId(null)}
            />
            {techs.map((tech) => (
              <TechRow
                key={tech.tech_id}
                name={tech.full_name}
                detail={`${t.fromTime(timeLabel(tech.next_opening))} · ${t.openings(tech.openings)}`}
                icon={<UserRound className="size-6" />}
                selected={techId === tech.tech_id}
                onSelect={() => setTechId(tech.tech_id)}
              />
            ))}
          </div>
        )}
      </Screen>
    );
  }

  // ---- Time --------------------------------------------------------------
  if (step === "time") {
    return (
      <Screen
        title={t.whenSuitsYou}
        subtitle={`${t.minutesShort(minutes)} · ${formatMoney(total)}`}
        onBack={() => setStep("tech")}
        footer={null}
      >
        {collision ? (
          <p className="mb-4 flex items-center gap-3 rounded-2xl border border-warning-border bg-warning-bg px-5 py-4 text-xl text-warning">
            <AlertTriangle className="size-6 shrink-0" />
            {t.timeTaken}
          </p>
        ) : null}

        {slots === null ? (
          <Spinner label={t.findingTimes} />
        ) : slots.length === 0 ? (
          <Empty title={t.noTimesLeft} body={t.noTimesLeftBody} />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {dedupe(slots, techId).map((slot) => (
              <button
                key={`${slot.slot_at}-${slot.tech_id}`}
                type="button"
                disabled={busy}
                onClick={() => book(slot)}
                className="min-h-[76px] rounded-2xl border border-subtle bg-surface-raised text-2xl font-semibold tabular-nums transition-colors active:bg-accent-subtle disabled:opacity-50"
              >
                {timeLabel(slot.slot_at)}
              </button>
            ))}
          </div>
        )}
        {busy ? <Spinner label={t.booking} /> : null}
      </Screen>
    );
  }

  return null;
}

/** The confirmation, after the appointment exists. */
export function KioskBooked({
  booking,
  onDone,
}: {
  booking: Extract<KioskBooking, { result: "booked" }>;
  onDone: () => void;
}) {
  const { t } = useKioskText();
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState(10);

  useEffect(() => {
    if (paused) return;
    if (left <= 0) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, paused, onDone]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <span className="flex size-24 items-center justify-center rounded-full bg-success-bg text-success">
        <Check className="size-14" />
      </span>
      <p className="text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-none">{t.youreBooked}</p>

      <div className="w-full max-w-lg space-y-2 rounded-3xl border border-subtle bg-surface-raised p-6">
        <p className="text-4xl font-semibold tabular-nums">{timeLabel(booking.starts_at)}</p>
        <p className="text-xl text-secondary-text">{booking.services}</p>
        {booking.tech_name ? (
          <p className="text-lg text-muted-text">{t.with(booking.tech_name)}</p>
        ) : null}
        <p className="text-lg text-muted-text">
          {t.aboutMinutes(booking.minutes)}
          {booking.ahead > 0 ? t.bookingsBefore(booking.ahead) : ""}
        </p>
      </div>

      {paused ? (
        <p className="text-lg text-muted-text">{t.takeYourTime}</p>
      ) : (
        <p className="text-lg text-muted-text tabular-nums">{t.clearingIn(left)}</p>
      )}

      <div className="flex gap-3">
        {!paused ? (
          <button
            type="button"
            onClick={() => setPaused(true)}
            className="min-h-[72px] rounded-2xl border border-subtle px-8 text-xl font-semibold text-secondary-text"
          >
            {t.giveMeAMinute}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="min-h-[72px] rounded-2xl bg-accent-default px-10 text-xl font-semibold text-on-accent"
        >
          {t.done}
        </button>
      </div>
    </div>
  );
}

/**
 * Minimal registration. Five fields, and no sixth.
 *
 * Everything a salon would like to know can be asked at the desk by a person.
 * A form on a tablet in a waiting room earns each field it asks for.
 */
export function KioskRegister({
  phone,
  onRegistered,
  onCancel,
}: {
  phone: string;
  onRegistered: (identity: BookingIdentity) => void;
  onCancel: () => void;
}) {
  const { t } = useKioskText();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [language, setLanguage] = useState("en");
  const [sensitivities, setSensitivities] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { id, error: failed } = await kioskRegister({
      first,
      last,
      phone,
      language,
      sensitivities,
    });
    setBusy(false);
    if (!id) {
      setError(failed ?? t.seeFrontDesk);
      return;
    }
    onRegistered({ customerId: id, displayName: first });
  };

  return (
    <Screen
      title={t.firstTimeHere}
      subtitle={t.justAFewThings}
      onBack={onCancel}
      footer={
        <Footer
          left={error ?? ""}
          right=""
          action={busy ? t.saving : t.continue_}
          disabled={busy || first.trim().length === 0}
          onAction={submit}
        />
      }
    >
      <div className="mx-auto w-full max-w-lg space-y-4">
        <Field label={t.firstName} value={first} onChange={setFirst} autoFocus />
        <Field label={t.lastName} value={last} onChange={setLast} />

        <div className="space-y-2">
          <label className="block text-lg font-medium">{t.language}</label>
          <div className="flex gap-2">
            {[
              { value: "en", label: "English" },
              { value: "vi", label: "Tiếng Việt" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLanguage(option.value)}
                className={cn(
                  "min-h-[72px] flex-1 rounded-2xl border text-xl font-semibold transition-colors",
                  language === option.value
                    ? "border-accent-default bg-accent-subtle text-accent-default"
                    : "border-subtle bg-surface-raised text-secondary-text",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Field
          label={t.avoidLabel}
          hint={t.avoidHint}
          value={sensitivities}
          onChange={setSensitivities}
        />
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function Screen({
  title,
  subtitle,
  onBack,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useKioskText();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-8 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex min-h-14 items-center gap-2 text-lg font-medium text-muted-text"
        >
          <ArrowLeft className="size-5" />
          {t.back}
        </button>
        <h2 className="text-4xl font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-xl text-secondary-text">{subtitle}</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">{children}</div>

      {footer}
    </div>
  );
}

function Footer({
  left,
  right,
  action,
  disabled,
  onAction,
}: {
  left: string;
  right: string;
  action: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-subtle bg-surface-raised px-8 py-4">
      <span className="min-w-0 flex-1 text-lg text-muted-text">{left}</span>
      {right ? <span className="text-2xl font-semibold tabular-nums">{right}</span> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className={cn(
          "min-h-[72px] rounded-2xl px-10 text-2xl font-semibold",
          disabled ? "bg-surface-overlay text-muted-text" : "bg-accent-default text-on-accent",
        )}
      >
        {action}
      </button>
    </div>
  );
}

function TechRow({
  name,
  detail,
  icon,
  selected,
  onSelect,
}: {
  name: string;
  detail: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-h-[84px] w-full items-center gap-4 rounded-2xl border px-5 text-left transition-colors",
        selected ? "border-accent-default bg-accent-subtle" : "border-subtle bg-surface-raised",
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-accent-default text-on-accent" : "bg-surface-overlay text-muted-text",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xl font-medium">{name}</span>
        <span className="block truncate text-lg text-muted-text">{detail}</span>
      </span>
      {selected ? <Check className="size-7 shrink-0 text-accent-default" /> : null}
    </button>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-lg font-medium">{label}</label>
      {hint ? <p className="text-base text-muted-text">{hint}</p> : null}
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[72px] w-full rounded-2xl border border-subtle bg-surface-raised px-5 text-2xl text-primary-text"
      />
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center justify-center gap-3 py-12 text-xl text-muted-text">
      <Loader2 className="size-6 animate-spin" />
      {label}
    </p>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2 py-12 text-center">
      <p className="text-3xl font-semibold">{title}</p>
      <p className="mx-auto max-w-md text-xl text-secondary-text">{body}</p>
    </div>
  );
}

function groupByCategory(services: KioskService[]) {
  const map = new Map<KioskService["category"], KioskService[]>();
  for (const service of services) {
    const list = map.get(service.category);
    if (list) list.push(service);
    else map.set(service.category, [service]);
  }
  return [...map.entries()];
}

/**
 * With "first available" chosen the server returns one row per free tech per
 * time. The customer picked *a time*, so show each time once and let the RPC
 * decide who takes it.
 */
function dedupe(slots: KioskSlot[], techId: string | null): KioskSlot[] {
  if (techId !== null) return slots;
  const seen = new Set<string>();
  return slots.filter((slot) => {
    if (seen.has(slot.slot_at)) return false;
    seen.add(slot.slot_at);
    return true;
  });
}

function soonest(techs: KioskTechOption[], fromTime: (time: string) => string): string {
  if (techs.length === 0) return "";
  const first = techs.reduce((best, tech) =>
    Date.parse(tech.next_opening) < Date.parse(best.next_opening) ? tech : best,
  );
  return fromTime(timeLabel(first.next_opening));
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
