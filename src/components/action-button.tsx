"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/toast";
import { EMPTY_ACTION_STATE, type ActionState } from "@/lib/types";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A one-button form bound to a server action, with hidden fields for its
 * payload. Results surface as a toast, so list rows stay a fixed height.
 *
 * This is how every queue action (start / complete / assign / cancel) is wired:
 * no client-side data fetching, just a form post and a server re-render.
 */
export function ActionButton({
  action,
  fields,
  children,
  confirm,
  silentSuccess,
  className,
  ...buttonProps
}: {
  action: ServerAction;
  fields: Record<string, string | null | undefined>;
  children: React.ReactNode;
  confirm?: string;
  /** Suppress the success toast when the UI change is self-evident. */
  silentSuccess?: boolean;
} & Omit<ButtonProps, "action" | "type">) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const toast = useToast();
  const seen = React.useRef(state);

  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;

    if (state.error) toast(state.error, "error");
    else if (state.ok && state.message && !silentSuccess) toast(state.message, "success");
  }, [state, toast, silentSuccess]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={className}
    >
      {Object.entries(fields).map(([name, value]) =>
        value == null ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      <SubmitButton {...buttonProps}>{children}</SubmitButton>
    </form>
  );
}

/**
 * Select that submits its enclosing action on change — used for the manager's
 * manual tech override on a queue card.
 */
export function ActionSelect({
  action,
  fields,
  name,
  value,
  children,
  "aria-label": ariaLabel,
  className,
}: {
  action: ServerAction;
  fields: Record<string, string | null | undefined>;
  name: string;
  value: string;
  children: React.ReactNode;
  "aria-label"?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_ACTION_STATE);
  const toast = useToast();
  const seen = React.useRef(state);

  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.error) toast(state.error, "error");
    else if (state.ok && state.message) toast(state.message, "success");
  }, [state, toast]);

  return (
    <form action={formAction} className={className}>
      {Object.entries(fields).map(([key, fieldValue]) =>
        fieldValue == null ? null : <input key={key} type="hidden" name={key} value={fieldValue} />,
      )}
      <select
        name={name}
        defaultValue={value}
        aria-label={ariaLabel}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {children}
      </select>
    </form>
  );
}

export { Button };
