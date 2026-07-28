"use client";

import { useState } from "react";

import { ActionForm } from "@/components/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { signIn, signUp } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["signin", "signup"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "h-9 rounded-md text-sm font-medium transition-colors",
                mode === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "signin" ? "Sign in" : "New salon"}
            </button>
          ))}
        </div>

        {mode === "signin" ? (
          <ActionForm action={signIn} resetOnSuccess={false} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <Field
              id="email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@salon.com"
              required
            />
            <Field
              id="password"
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
            />
            <SubmitButton className="w-full" size="lg">
              Sign in
            </SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={signUp} resetOnSuccess={false} className="space-y-4">
            <Field id="salon_name" name="salon_name" label="Salon name" placeholder="Polished Nail Bar" required />
            <Field id="full_name" name="full_name" label="Your name" placeholder="Alex Tran" required />
            <Field
              id="signup_email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@salon.com"
              required
            />
            <Field
              id="signup_password"
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              hint="At least 8 characters."
            />
            <SubmitButton className="w-full" size="lg">
              Create salon
            </SubmitButton>
            <p className="text-center text-xs text-muted-foreground">
              You&apos;ll be the manager. Add your techs from Settings.
            </p>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
