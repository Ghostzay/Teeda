"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * What a broken screen looks like.
 *
 * Without this, a thrown error renders as an empty dark rectangle inside the
 * shell — the nav and header stay, the content vanishes, and there is nothing
 * to report but "it went black". This keeps the shell, says which screen
 * failed, and puts the actual message one tap away, because the person holding
 * the tablet is the only one who can tell us what it said.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    // Also goes to the browser console, so it survives a screenshot of the page.
    console.error("Screen failed to render:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-2xl border border-danger-border bg-surface-raised p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 space-y-2">
            <h1 className="text-title">This screen didn&apos;t load</h1>
            <p className="text-sm text-secondary-text">
              The rest of the app still works — use the menu to carry on. If it keeps happening,
              tap &ldquo;What went wrong&rdquo; and send us that text.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={reset}>
            <RotateCw className="size-4" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => setShowDetail((value) => !value)}>
            What went wrong
            <ChevronDown
              className={`size-4 transition-transform ${showDetail ? "rotate-180" : ""}`}
            />
          </Button>
        </div>

        {showDetail ? (
          <div className="mt-4 space-y-2 rounded-xl border border-subtle bg-surface-sunken p-3">
            <p className="text-meta uppercase text-muted-text">Message</p>
            <p className="break-words font-mono text-sm text-primary-text">
              {error.message || "No message was provided."}
            </p>
            {error.digest ? (
              <>
                <p className="pt-2 text-meta uppercase text-muted-text">Digest</p>
                <p className="font-mono text-sm text-primary-text">{error.digest}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
