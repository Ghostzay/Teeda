/**
 * The once-a-day entry sequence: shared names and the server-side decision.
 *
 * The cookie value is `userId.dayKey`. Matching both halves is what makes the
 * sequence per-user on a shared tablet; the day key baked into the value is
 * what makes it daily without any expiry arithmetic.
 */

export const ENTRY_COOKIE = "zolvora_entry_seen";

/** Today, on the salon's own calendar — the same clock the rotation runs on. */
export function entryDayKey(timezone: string): string {
  // en-CA formats as YYYY-MM-DD; the try covers a salon row with a timezone
  // string Intl does not recognise, which should degrade to "plays again",
  // never to a crashed layout.
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA").format(new Date());
  }
}

export function shouldPlayEntry(
  cookieValue: string | undefined,
  userId: string,
  dayKey: string,
): boolean {
  return cookieValue !== `${userId}.${dayKey}`;
}
