import { redirect } from "next/navigation";

import { getAuthUser, getSessionContext } from "@/lib/auth";

/** Route each role to the screen they actually work from. */
export default async function RootPage() {
  const session = await getSessionContext();

  if (session) {
    redirect(session.canManageFloor ? "/dashboard" : "/tech");
  }

  // Signed in but not attached to a salon yet — finish setting one up.
  const user = await getAuthUser();
  if (user) redirect("/welcome");

  redirect("/login");
}
