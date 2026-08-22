import { headers } from "next/headers";

import { ZolvoraLogo, ZolvoraWordmark } from "@/components/brand";
import { TENANT_SLUG_HEADER, TENANT_STATE_HEADER, lookupSalonBySlug } from "@/lib/tenant";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Set by the middleware when this request arrived on a tenant subdomain.
  // Presentation only: whose name the door wears, never who gets in.
  const requestHeaders = await headers();
  const slug = requestHeaders.get(TENANT_SLUG_HEADER);
  const suspended = requestHeaders.get(TENANT_STATE_HEADER) === "suspended";
  const salon = slug ? await lookupSalonBySlug(slug) : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <ZolvoraLogo size={88} priority />
          <div className="space-y-1">
            {salon ? (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">{salon.name}</h1>
                <p className="text-sm text-muted-foreground">Staff sign in · Đăng nhập</p>
              </>
            ) : (
              <>
                <h1>
                  <ZolvoraWordmark className="text-2xl" />
                </h1>
                <p className="text-sm text-muted-foreground">
                  Fair turns, happy techs, shorter waits.
                </p>
              </>
            )}
          </div>
        </div>

        {suspended ? (
          <p className="rounded-2xl border border-warning-border bg-warning-bg px-5 py-4 text-center text-sm text-warning">
            This salon&apos;s account is paused — signing in will show its status.
            Tài khoản của tiệm đang tạm ngưng.
          </p>
        ) : null}

        <LoginForm next={next ?? "/"} />

        {salon ? (
          <p className="text-center text-meta text-muted-text">
            Powered by <ZolvoraWordmark className="text-meta" />
          </p>
        ) : null}
      </div>
    </main>
  );
}
