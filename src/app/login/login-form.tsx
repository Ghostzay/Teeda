"use client";

import { ActionForm } from "@/components/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { signIn } from "@/lib/actions/auth";

/**
 * Sign in, and only sign in.
 *
 * The "New salon" tab that used to sit beside it is gone on purpose: salons
 * are provisioned by the platform, owners arrive by emailed invite, and staff
 * are added by their owner. A signup form on the public door was the first of
 * the three layers that had to close — the RPC and the RLS policy behind it
 * are closed in the same change.
 */
export function LoginForm({ next }: { next: string }) {
  return (
    <Card>
      <CardContent className="p-5">
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
