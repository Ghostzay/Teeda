/**
 * Tenant resolution: which salon's front door is this request knocking on?
 *
 * {slug}.<root-domain> resolves to a salon; the apex (and www) is the
 * platform's own entry. The root domain comes from NEXT_PUBLIC_ROOT_DOMAIN;
 * in development, `{slug}.localhost` works out of the box because browsers
 * resolve *.localhost to loopback without /etc/hosts entries.
 *
 * THE SLUG IS NOT A SECURITY BOUNDARY. Every query in the app is scoped by
 * auth.uid() -> current_salon_id() under RLS; a forged Host header buys an
 * attacker a login page wearing a salon's name — which the public internet
 * shows anyone anyway — and nothing else. The resolved salon is used for the
 * login screen's branding, the not-found page, and redirecting a signed-in
 * user whose salon does not match the host. It never widens a query.
 *
 * Custom domains later: `resolveTenant` already falls through to a
 * custom-domain branch when the host matches no subdomain pattern; today that
 * branch returns "apex" (nothing maps), and mapping a domain becomes a lookup
 * against salons.custom_domain in that one spot. Nothing else changes.
 */

export type TenantHost =
  | { kind: "apex" }
  | { kind: "salon"; slug: string };

/** What `salon_by_slug` answers — everything a login screen may know. */
export type PublicSalon = {
  id: string;
  slug: string;
  name: string;
  default_theme: string;
  suspended: boolean;
  logo_url: string | null;
  brand_color: string | null;
  powered_by: boolean;
};

/** Request-header names the middleware uses to hand the resolution down. */
export const TENANT_SLUG_HEADER = "x-zolvora-salon-slug";
export const TENANT_STATE_HEADER = "x-zolvora-tenant";

export function parseTenantHost(hostHeader: string | null | undefined): TenantHost {
  const host = (hostHeader ?? "").toLowerCase().split(":")[0];
  if (!host) return { kind: "apex" };

  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase().replace(/^\.+/, "");

  let sub: string | null = null;
  if (root && host.endsWith(`.${root}`)) {
    sub = host.slice(0, -(root.length + 1));
  } else if (host.endsWith(".localhost")) {
    // Dev: salon-a.localhost:3000 without configuring anything.
    sub = host.slice(0, -".localhost".length);
  } else {
    // The apex itself, an IP, a preview URL, or a future custom domain —
    // the custom-domain lookup slots in HERE when it is built.
    return { kind: "apex" };
  }

  // A nested label (a.b.root) is nobody's salon; www is the apex's alias.
  if (!sub || sub === "www" || sub.includes(".")) return { kind: "apex" };
  return { kind: "salon", slug: sub };
}

/* ----------------------------------------------------------------------------
 * The slug -> salon lookup, cached.
 *
 * Runs in edge middleware on every request to a tenant subdomain, so it must
 * not cost a database round-trip every time. Per-instance in-memory cache:
 * hits are kept for a minute, misses for fifteen seconds (a typo'd subdomain
 * shouldn't hammer the database, but a freshly created salon shouldn't be
 * invisible for long either).
 * -------------------------------------------------------------------------- */

const HIT_TTL_MS = 60_000;
const MISS_TTL_MS = 15_000;

type CacheEntry = { value: PublicSalon | null; expires: number };
const cache = new Map<string, CacheEntry>();

export async function lookupSalonBySlug(slug: string): Promise<PublicSalon | null> {
  const key = slug.toLowerCase();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.value;

  const value = await fetchSalonBySlug(key);
  cache.set(key, { value, expires: now + (value ? HIT_TTL_MS : MISS_TTL_MS) });

  // The cache lives for the life of the edge isolate; don't let a scanner
  // walking random subdomains grow it without bound.
  if (cache.size > 500) {
    for (const [k, v] of cache) {
      if (v.expires <= now) cache.delete(k);
    }
    if (cache.size > 500) cache.clear();
  }

  return value;
}

/**
 * Straight PostgREST call rather than a supabase-js client: this runs in
 * middleware for anonymous visitors too, and needs none of the cookie or
 * session machinery — just one RPC with the anon key.
 */
async function fetchSalonBySlug(slug: string): Promise<PublicSalon | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/salon_by_slug`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as PublicSalon | null;
    return data && typeof data === "object" && "slug" in data ? data : null;
  } catch {
    // Database unreachable: treat as unknown. The not-found page is the safe
    // wrong answer; leaking a 500 with a stack is not.
    return null;
  }
}
