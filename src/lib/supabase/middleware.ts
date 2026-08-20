import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { KIOSK_COOKIE, readKioskMode } from "@/lib/kiosk-mode";
import type { Database } from "@/lib/types/database";

/**
 * `/kiosk-stalled` is public because it is the screen for a device that has no
 * session left to check. It lives outside `/kiosk` on purpose: everything under
 * that segment goes through `requireKiosk()`, which redirects a sessionless
 * request to /login — the exact redirect this screen exists to replace.
 */
/* `/brand-preview` is the design-system reference sheet: static markup, no
   data, no session — public the way a styleguide is public. */
const PUBLIC_ROUTES = ["/login", "/auth", "/kiosk-stalled", "/brand-preview"];

/**
 * Refreshes the auth cookies on every request and gates the app routes.
 * Must run before any Server Component reads the session.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

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
