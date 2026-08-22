import type { Metadata } from "next";

import { ZolvoraMark, ZolvoraWordmark } from "@/components/brand";
import { AdminConsole } from "@/components/admin/admin-console";
import { adminListSalons } from "@/lib/actions/admin";
import { signOut } from "@/lib/actions/auth";
import { requireSuperAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform — Zolvora",
  robots: { index: false, follow: false },
};

/**
 * The platform console. Cross-salon by definition, so it does NOT live inside
 * the (app) shell — no salon nav, no salon name in the corner, nothing that
 * implies "you are inside a tenant". Everything on it goes through
 * requireSuperAdmin() here and is_super_admin() again inside each RPC.
 */
export default async function AdminPage() {
  const session = await requireSuperAdmin();
  const salons = await adminListSalons();

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center gap-3 border-b border-subtle bg-surface-sunken px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-default text-on-accent">
          <ZolvoraMark className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">
            <ZolvoraWordmark className="text-[0.9375rem]" />
          </p>
          <p className="text-meta text-muted-text">Platform console · {session.email}</p>
        </div>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
        <AdminConsole salons={salons} />
      </main>
    </div>
  );
}
