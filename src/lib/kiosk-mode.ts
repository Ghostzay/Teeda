
/**
 * Kiosk mode: a session downgrade, enforced on the server.
 *
 * ---------------------------------------------------------------------------
 * Where the flag lives
 * ---------------------------------------------------------------------------
 * A cookie: `teeda_kiosk`, httpOnly, SameSite=Lax, Secure in production, one
 * year. Its value is `deviceKey.userId.expiry.hmac`, signed with the service
 * role key.
 *
 * A cookie rather than a database row because middleware reads this on *every*
 * request, and it already pays for one profile lookup there. A second query per
 * request to answer "is this tablet locked" is a cost paid on every page in the
 * app to serve the rarest state it has.
 *
 * httpOnly and signed rather than localStorage because a flag the client can
 * write is not a restriction, it is a suggestion. The whole point of this file
 * is that a manager who starts kiosk mode on the front tablet is not one typed
 * URL away from the takings — and a manager is exactly the person who knows
 * how to open a devtools console.
 *
 * ---------------------------------------------------------------------------
 * Web Crypto, not node:crypto
 * ---------------------------------------------------------------------------
 * The middleware is the first thing that reads this flag, and middleware runs
 * on the Edge runtime, which has no `node:crypto`. `crypto.subtle` exists in
 * both Edge and Node, so the signing lives there and every function here is
 * async as a consequence.
 *
 * ---------------------------------------------------------------------------
 * Bound to the user
 * ---------------------------------------------------------------------------
 * The signed payload carries the user id it was issued for. A cookie lifted
 * from one device and pasted into another session does nothing: the id will not
 * match, and `readKioskMode` returns null. Without that, a stolen kiosk cookie
 * would be a way to *impose* kiosk mode on somebody else's session — a nuisance
 * rather than a breach, but free to prevent.
 */

export const KIOSK_COOKIE = "teeda_kiosk";

/**
 * The two strings the stalled screen needs, cached where they survive the
 * session that produced them.
 *
 * When a tablet's refresh token finally dies, there is no session left to ask
 * "which salon is this?" — and the alternative to remembering is a grey screen
 * that says nothing, on a device mounted in somebody's reception. Both values
 * are already printed in 3rem type on the front of the tablet, so caching them
 * discloses nothing; httpOnly anyway, because there is no reason for the page
 * to write its own branding.
 */
export const KIOSK_BRAND_COOKIE = "teeda_kiosk_brand";

export type KioskBrand = { salonName: string; deviceLabel: string };

/** Pack the branding into one cookie value. `|` is stripped, so it can split. */
export function kioskBrandCookie(brand: KioskBrand) {
  const clean = (value: string) => value.replace(/\|/g, " ").slice(0, 120);
  return {
    name: KIOSK_BRAND_COOKIE,
    value: encodeURIComponent(`${clean(brand.salonName)}|${clean(brand.deviceLabel)}`),
    options: {
      httpOnly: true as const,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

/** Unpack it. Returns null rather than half a brand. */
export function readKioskBrand(raw: string | undefined): KioskBrand | null {
  if (!raw) return null;
  const [salonName, deviceLabel] = decodeURIComponent(raw).split("|");
  if (!salonName || !deviceLabel) return null;
  return { salonName, deviceLabel };
}

/** A year. It has to survive a device reboot; a shift is not long enough. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type KioskModeState = {
  /** Stable per device. Keys the PIN lockout so guessing is rate-limited. */
  deviceKey: string;
  userId: string;
};

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Failing loudly beats signing with a fallback: a predictable secret means
    // anyone can mint a cookie, and a cookie that can be minted is not a
    // boundary. Callers treat a throw as "not in kiosk mode".
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign the kiosk-mode cookie.");
  }
  return key;
}

const encoder = new TextEncoder();

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64url(new Uint8Array(mac));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Constant-time compare, so the signature cannot be guessed a byte at a time.
 *
 * Hand-rolled because `timingSafeEqual` is node:crypto and this has to run on
 * the Edge too. Always walks the full length; the early return is only for
 * differing lengths, which leaks nothing an attacker does not already know.
 */
function signatureMatches(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

/** Mint the cookie value for a user entering kiosk mode. */
export async function issueKioskMode(userId: string, deviceKey?: string): Promise<{
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
}> {
  const key = deviceKey ?? crypto.randomUUID();
  const expiry = String(Date.now() + MAX_AGE_SECONDS * 1000);
  const payload = `${key}.${userId}.${expiry}`;

  return {
    value: `${payload}.${await sign(payload)}`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

/**
 * Verify a cookie value against the user it should belong to.
 *
 * Returns null for anything that is not a valid, unexpired signature issued to
 * this exact user — a missing cookie, a tampered one, one from another session,
 * or one signed before the secret rotated. Every failure is the same answer,
 * because "your cookie is expired" and "your cookie is forged" are the same
 * decision here.
 */
export async function readKioskMode(
  raw: string | undefined,
  userId: string,
): Promise<KioskModeState | null> {
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 4) return null;

  const [deviceKey, signedUserId, expiry, signature] = parts;
  const payload = `${deviceKey}.${signedUserId}.${expiry}`;

  let expected: string;
  try {
    expected = await sign(payload);
  } catch {
    // No secret configured. Fail closed on the *flag*, not on the app: the user
    // simply is not in kiosk mode, which is the safe direction — a manager gets
    // their dashboard back rather than being locked out of it.
    return null;
  }

  if (!signatureMatches(expected, signature)) return null;
  if (signedUserId !== userId) return null;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  return { deviceKey, userId: signedUserId };
}

/** The cookies that clear kiosk mode. Same attributes, zero lifetime. */
export function clearKioskModeCookie() {
  const expired = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  return [
    { name: KIOSK_COOKIE, value: "", options: expired },
    { name: KIOSK_BRAND_COOKIE, value: "", options: expired },
  ];
}
