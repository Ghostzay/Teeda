import { redirect } from "next/navigation";

/**
 * Walk-ins and the dashboard merged into one screen. The path stays so
 * bookmarks on a mounted tablet, links in the guide, and anything a tech
 * saved keep working instead of 404ing.
 */
export default function QueueRedirect() {
  redirect("/dashboard");
}
