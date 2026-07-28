"use client";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { setCommission } from "@/lib/actions/commission";

/**
 * One tech's commission rate. Manager only — the value lives in `tech_pay`
 * rather than on the profile precisely so the roster can't leak it.
 *
 * Blank means "use the salon default", so a new hire needs no setup.
 */
export function CommissionEditor({
  techId,
  rate,
  fallback,
}: {
  techId: string;
  rate: number | null;
  /** The salon default, shown when this tech has no override. */
  fallback: number;
}) {
  return (
    <ActionForm
      action={setCommission}
      resetOnSuccess={false}
      className="flex items-center gap-2"
      errorClassName="text-xs font-medium text-destructive"
    >
      <input type="hidden" name="tech_id" value={techId} />
      <div className="relative">
        <Input
          name="commission_percent"
          inputMode="decimal"
          defaultValue={rate === null ? "" : String(rate)}
          placeholder={String(fallback)}
          aria-label="Commission rate"
          className="h-10 w-20 pr-6 text-center"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
      <SubmitButton variant="outline" size="sm">
        Save
      </SubmitButton>
    </ActionForm>
  );
}
