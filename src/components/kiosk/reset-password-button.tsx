"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resetKioskPassword } from "@/lib/actions/kiosk";
import { cn } from "@/lib/utils";

/**
 * Generate a new password for a tablet and show it once.
 *
 * Once, and genuinely once: the plaintext is never stored, so this panel is the
 * only copy that will ever exist. Hence the confirm — dismissing it by accident
 * costs another reset, and a reset while the tablet is in use signs it out.
 */
export function ResetPasswordButton({ deviceId, label }: { deviceId: string; label: string }) {
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = async () => {
    setBusy(true);
    setError(null);
    const result = await resetKioskPassword(deviceId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't reset the password.");
      return;
    }
    setCreds({ email: result.email ?? "", password: result.password ?? "" });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              `Reset the password for ${label}? The tablet will be signed out and will need the new password typed in.`,
            )
          ) {
            void reset();
          }
        }}
      >
        <KeyRound className="size-4" />
        {busy ? "Resetting…" : "Reset password"}
      </Button>

      {error ? <p className="w-full text-meta text-danger">{error}</p> : null}

      {creds ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-surface-canvas/95 p-6">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-subtle bg-surface-raised p-6">
            <div>
              <p className="text-title">{label}</p>
              <p className="text-sm text-secondary-text">
                Type these into the tablet once. This is the only time the password will be
                shown — it is not stored anywhere.
              </p>
            </div>

            <dl className="space-y-2 rounded-xl border border-subtle bg-surface-sunken p-4">
              <div>
                <dt className="text-meta uppercase tracking-wide text-muted-text">Email</dt>
                <dd className="break-all font-mono text-sm">{creds.email}</dd>
              </div>
              <div>
                <dt className="text-meta uppercase tracking-wide text-muted-text">Password</dt>
                <dd className="break-all font-mono text-lg font-semibold">{creds.password}</dd>
              </div>
            </dl>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(`${creds.email}\n${creds.password}`);
                setCopied(true);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy both"}
            </Button>

            <Button
              type="button"
              className={cn("w-full")}
              onClick={() => {
                setCreds(null);
                setCopied(false);
              }}
            >
              I saved this
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
