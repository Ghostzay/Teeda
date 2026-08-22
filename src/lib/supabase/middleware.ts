import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { KIOSK_COOKIE, readKioskMode } from "@/lib/kiosk-mode";
import {
  TENANT_SLUG_HEADER,
  TENANT_STATE_HEADER,
  lookupSalonBySlug,
  parseTenantHost,
} from "@/lib/tenant";
import type { Database } from "@/lib/types/database";

/**
 * `/kiosk-stalled` is public because it is the screen for a device that has no
 * session left to check. It lives outside `/kiosk` on purpose: everything under
 * that segment goes through `requireKiosk()`, which redirects a sessionless
 * request to /login — the exact redirect this screen exists to replace.
 */
/* `/brand-preview` is the design-system reference sheet: static markup, no
   data, no session — public the way a styleguide is public. */
const PUBLIC_ROUTES = ["/login", "/auth", "/kiosk-stalled", "/salon-not-found", "/brand-preview"];

/**
 * Refreshes the auth cookies on every request and gates the app routes.
 * Must run before any Server Component reads the session.
 */
export async function updateSession(request: NextRequest) {
  // The one thing that must never happen here is an uncaught throw: this
  // function fronts EVERY request, so an exception is not a broken page, it
  // is a broken product (MIDDLEWARE_INVOCATION_FAILED on everything). The two
  // rules that follow from that:
  //   * misconfiguration gets a clear, named response, not a crash;
  //   * the incoming request's headers are never mutated — the deployed edge
  //     runtime can hand middleware an immutable request, so the resolution
  //     travels on a CLONE, per Next's documented pattern.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Say exactly what is wrong, in the browser and in the logs. A bare crash
    // here cost a debugging round trip once; never again.
    console.error(
      "Middleware cannot run: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are not set in this deployment's environment variables.",
    );
    return new NextResponse(
      "Server configuration error: Supabase environment variables are missing. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the hosting environment and redeploy.",
      { status: 500, headers: { "content-type": "text/plain" } },
    );
  }

  // --------------------------------------------------------------------------
  // Tenant resolution, before anything else: which salon's front door is this?
  //
  // The answer travels DOWN the request as headers for layouts and the login
  // page to read. It is presentation and routing — never query scope. RLS
  // under auth.uid() remains the only isolation boundary; a forged Host gets
  // a login page wearing a salon's name and nothing else.
  //
  // Written onto a clone, never onto request.headers itself — see above. The
  // clone also starts with any spoofed copies of our own headers stripped, so
  // downstream only ever sees what THIS function resolved.
  // --------------------------------------------------------------------------
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(TENANT_SLUG_HEADER);
  requestHeaders.delete(TENANT_STATE_HEADER);

  try {
    const tenant = parseTenantHost(request.headers.get("host"));
    if (tenant.kind === "salon") {
      const salon = await lookupSalonBySlug(tenant.slug);
      if (!salon) {
        // Unknown subdomain: one clean page. A rewrite, not a redirect, so the
        // typo stays in the address bar; and nothing on the page hints at
        // which slugs DO exist.
        const url = request.nextUrl.clone();
        url.pathname = "/salon-not-found";
        url.search = "";
        return NextResponse.rewrite(url);
      }
      requestHeaders.set(TENANT_SLUG_HEADER, salon.slug);
      requestHeaders.set(TENANT_STATE_HEADER, salon.suspended ? "suspended" : "active");
    }
  } catch (error) {
    // Tenant resolution is branding and routing, not auth: if it somehow
    // throws, the front door must not fall over with it. Log loudly and carry
    // on as the apex — the failure is visible in the logs, not to customers.
    console.error("Tenant resolution failed; continuing as apex:", error);
  }

  const withResolvedHeaders = () => NextResponse.next({ request: { headers: requestHeaders } });
  let response = withResolvedHeaders();

  // Cookie state lives in OUR map, layered over the incoming request's
  // cookies, which are only ever READ. The old pattern wrote refreshed tokens
  // back with request.cookies.set() — a mutation of the incoming request by
  // another name, and exactly the class of thing an immutable edge request
  // rejects.
  const cookieOverrides = new Map<string, string>();
  const currentCookies = () => {
    const merged = new Map(request.cookies.getAll().map(({ name, value }) => [name, value]));
    for (const [name, value] of cookieOverrides) merged.set(name, value);
    return [...merged.entries()].map(([name, value]) => ({ name, value }));
  };

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return currentCookies();
      },
      setAll(cookiesToSet) {
        // Refreshed auth cookies must reach BOTH sides: the response (so the
        // browser stores them) and the forwarded request headers (so server
        // components in this same render see the fresh token).
        cookiesToSet.forEach(({ name, value }) => cookieOverrides.set(name, value));
        requestHeaders.set(
          "cookie",
          currentCookies()
            .map(({ name, value }) => `${name}=${value}`)
            .join("; "),
        );
        response = withResolvedHeaders();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not remove: this refreshes the session token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();

    // A tablet whose session died does not get a login form.
    //
    // Nobody in a waiting room can satisfy one, and a customer staring at an
    // email field on the salon's tablet is worse than a screen that says what
    // happened. The signature cannot be checked — there is no user id to check
    // it against — but nothing here needs it to be: the destination is a static
    // screen with two lines of text on it, and the cookie is httpOnly, so the
    // page a customer is looking at could not have set it.
    if (request.cookies.get(KIOSK_COOKIE)) {
      url.pathname = "/kiosk-stalled";
      url.search = "";
      return NextResponse.redirect(url);
    }

    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // A recovered session has no business sitting on the stalled screen.
  if (user && pathname === "/kiosk-stalled") {
    const url = request.nextUrl.clone();
    url.pathname = "/kiosk";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // --------------------------------------------------------------------------
  // Kiosk containment.
  //
  // Two ways to be a kiosk here:
  //
  //   * the account's role is 'kiosk'  — a tablet's own login;
  //   * the kiosk-mode cookie is set   — any role that started kiosk mode on
  //     this device, verified against a signature bound to their user id.
  //
  // This is the cheap half of the boundary, not the boundary. `getSessionContext`
  // applies the same downgrade on the render path, so a route the matcher misses
  // still gets a kiosk session rather than a manager one, and RLS refuses the
  // data underneath both. Three layers; the last one is load bearing.
  // --------------------------------------------------------------------------
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const inKioskMode =
      (await readKioskMode(request.cookies.get(KIOSK_COOKIE)?.value, user.id)) !== null;
    const isKioskRole = profile?.role === "kiosk";
    const confined = isKioskRole || inKioskMode;
    const onKioskRoute = pathname === "/kiosk" || pathname.startsWith("/kiosk/");

    if (confined && !onKioskRoute) {
      const url = request.nextUrl.clone();
      // `/kiosk/ready`, not `/kiosk`.
      //
      // This line said `/kiosk` and that was the dead end: signing in on a
      // tablet dropped it straight into the locked customer screen, past the
      // screen with the Start button on it. The exit hatch is disabled until a
      // PIN exists, and there is no way to set a PIN before first sign-in — so
      // the tablet was locked with no way out at all.
      //
      // Landing on `ready` means arriving as staff holding a device. Entering
      // the locked screen is now something somebody chooses.
      url.pathname = inKioskMode ? "/kiosk" : "/kiosk/ready";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (!confined && onKioskRoute) {
      const url = request.nextUrl.clone();
      // A tech has no dashboard, so send each role somewhere it can actually
      // load rather than bouncing them through a second redirect.
      url.pathname = profile?.role === "tech" ? "/tech" : "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Already in kiosk mode: the ready screen is behind the PIN, not one tap
    // away. Without this, "start kiosk mode" would be undone by the back button.
    if (inKioskMode && pathname.startsWith("/kiosk/ready")) {
      const url = request.nextUrl.clone();
      url.pathname = "/kiosk";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
