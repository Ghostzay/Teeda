/** Small date/time helpers. Kept dependency-free — Intl covers everything V1 needs. */

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** "12m", "1h 04m" — how long someone has been waiting or working. */
export function formatDuration(fromIso: string | null | undefined, toIso?: string | null): string {
  if (!fromIso) return "—";
  const from = Date.parse(fromIso);
  const to = toIso ? Date.parse(toIso) : Date.now();
  const minutes = Math.max(0, Math.round((to - from) / 60_000));

  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "Never", "3m ago", "2h ago" — for last_turn_at on the rotation board. */
export function formatRelative(iso: string | null | undefined, emptyLabel = "Never"): string {
  if (!iso) return emptyLabel;
  return `${formatDuration(iso)} ago`;
}

/** Start of today in the local timezone, as an ISO string for range filters. */
export function startOfToday(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export function endOfToday(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}

/** yyyy-mm-dd in local time — used for date inputs and day filters. */
export function toDateInputValue(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Local day boundaries for a yyyy-mm-dd string. */
export function dayRange(dateString: string): { start: string; end: string } {
  const [year, month, day] = dateString.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
