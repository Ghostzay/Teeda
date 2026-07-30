import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/types/database";

const PUBLIC_ROUTES = ["/login", "/auth"];

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
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
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
  // A tablet in the waiting room must not be one typed URL away from the
  // takings. This keeps it on /kiosk/* and keeps everyone else off.
  //
  // It is the *cheap* half of the boundary, not the boundary: it runs one
  // query per request and can be sidestepped by anything the matcher misses.
  // The layouts re-check with `requireKiosk()` / `requireSession()`, and RLS
  // refuses the data regardless. Three layers, and only the last one is load
  // bearing.
  // --------------------------------------------------------------------------
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isKiosk = profile?.role === "kiosk";
    const onKioskRoute = pathname === "/kiosk" || pathname.startsWith("/kiosk/");

    if (isKiosk && !onKioskRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/kiosk";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (!isKiosk && onKioskRoute) {
      const url = request.nextUrl.clone();
      // A tech has no dashboard, so send each role somewhere it can actually
      // load rather than bouncing them through a second redirect.
      url.pathname = profile?.role === "tech" ? "/tech" : "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
