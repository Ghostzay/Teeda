import { Sparkles } from "lucide-react";

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
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Teeda</h1>
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
