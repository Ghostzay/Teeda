import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth";
import { homeForRole } from "@/lib/navigation";

/**
 * Walk-ins and the dashboard merged into one screen. The path stays so
 * bookmarks on a mounted tablet, links in the guide, and anything a tech
 * saved keep working instead of 404ing.
 *
 * Routes by role rather than always to /dashboard. It reached the right place
 * either way — the app layout would have bounced a kiosk or a tech onward —
 * but a redirect that names one role's home is a redirect that sends everyone
 * else through a screen they are not allowed to see first.
 */
export default async function QueueRedirect() {
  const session = await getSessionContext();
  redirect(session ? homeForRole(session.role) : "/dashboard");
}
