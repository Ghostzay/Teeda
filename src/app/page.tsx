import { redirect } from "next/navigation";

import { getAuthUser, getSessionContext } from "@/lib/auth";

/** Route each role to the screen they actually work from. */
export default async function RootPage() {
  const session = await getSessionContext();

  if (session) {
    redirect(session.isManager ? "/dashboard" : "/tech");
  }

  const user = await getAuthUser();
  // Signed in but not attached to a salon yet — the app shell explains why.
  if (user) redirect("/tech");

  redirect("/login");
}
