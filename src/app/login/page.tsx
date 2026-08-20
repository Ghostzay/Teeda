import { ZolvoraLogo, ZolvoraWordmark } from "@/components/brand";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <ZolvoraLogo size={88} priority />
          <div className="space-y-1">
            <h1>
              <ZolvoraWordmark className="text-2xl" />
            </h1>
            <p className="text-sm text-muted-foreground">
              Fair turns, happy techs, shorter waits.
            </p>
          </div>
        </div>

        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
