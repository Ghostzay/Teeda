"use client";

import { LayoutGrid } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveSalonDashboardLayout } from "@/lib/actions/dashboard";
import type { StoredLayout } from "@/lib/dashboard";

/**
 * Publish your own arrangement as the salon's starting point.
 *
 * Only affects people who have not arranged their own — resolution is user
 * layout, then salon default, then the recommended one — so this never yanks
 * a dashboard out from under an admin who has already set theirs up.
 */
export function DashboardDefaultForm({ layout }: { layout: StoredLayout }) {
  return (
    <ActionForm action={saveSalonDashboardLayout} resetOnSuccess={false} className="space-y-3">
      <input type="hidden" name="layout" value={JSON.stringify(layout)} />
      <SubmitButton variant="outline">
        <LayoutGrid className="size-4" />
        Use my dashboard as the salon default
      </SubmitButton>
    </ActionForm>
  );
}
