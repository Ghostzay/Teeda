import { redirect } from "next/navigation";

import { ZolvoraLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { getAuthUser, getSessionContext } from "@/lib/auth";
import { homeForRole } from "@/lib/navigation";

/**
 * A signed-in user with no salon.
 *
 * This page used to be the self-serve salon creator; that door is closed at
 * all three layers (no form here, the RPC refuses, RLS refuses beneath it).
 * The only people who land here now are staff whose owner has not added them
 * yet — so the page says exactly what to do about that, and nothing else.
 */
export default async function WelcomePage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // Attached to a salon after all — nothing to do here.
  const session = await getSessionContext();
  if (session) redirect(homeForRole(session.role));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <ZolvoraLogo size={72} priority />
          <h1 className="text-2xl font-semibold tracking-tight">
            You&apos;re signed in, but not on a team yet
          </h1>
          <p className="text-lg text-secondary-text">Tài khoản chưa được thêm vào tiệm nào</p>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Ask your salon&apos;s owner to add <strong>{user.email}</strong> from
            their Team page, then sign in again.
          </p>
          <p>
            Nhờ chủ tiệm thêm địa chỉ email của bạn trong trang Team, sau đó đăng
            nhập lại.
          </p>
        </div>

        <form action={signOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
