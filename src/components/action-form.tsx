"use client";

import * as React from "react";
import { useActionState } from "react";

import { useToast } from "@/components/toast";
import { EMPTY_ACTION_STATE, type ActionState } from "@/lib/types";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form bound to a server action. Errors render inline (forms are tall enough
 * that a toast would be missed), successes toast and optionally reset the form.
 */
export function ActionForm({
  action,
  children,
  onSuccess,
  resetOnSuccess = true,
  className,
  errorClassName,
}: {
  action: ServerAction;
  children: React.ReactNode;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
  className?: string;
  errorClassName?: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const formRef = React.useRef<HTMLFormElement>(null);
  const toast = useToast();
  const seen = React.useRef(state);

  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;

    if (state.ok) {
      if (state.message) toast(state.message, "success");
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.();
    }
  }, [state, toast, onSuccess, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state.error ? (
        <p
          className={
            errorClassName ??
            "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          }
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message && !resetOnSuccess ? (
        <p className="rounded-lg border border-transparent bg-completed-bg px-3 py-2 text-sm font-medium text-completed">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
