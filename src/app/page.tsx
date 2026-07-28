import { redirect } from "next/navigation";

import { getAuthUser, getSessionContext } from "@/lib/auth";
import { homeForRole } from "@/lib/navigation";

/** Route each role to the screen they actually work from. */
export default async function RootPage() {
  const session = await getSessionContext();

  if (session) {
    redirect(homeForRole(session.role));
  }

  // Signed in but not attached to a salon yet — finish setting one up.
  const user = await getAuthUser();
  if (user) redirect("/welcome");

  redirect("/login");
}
