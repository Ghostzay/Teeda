import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adminStopImpersonation } from "@/lib/actions/admin";

/**
 * Unmistakable, by design. Danger colours, full width, above everything, on
 * every screen of the impersonated salon — support view must never be
 * something an admin forgets they are in, or something a screenshot hides.
 * Every entry and exit is already an audit row; this is the human half.
 */
export function ImpersonationBanner({ salonName }: { salonName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-danger-border bg-danger-bg px-4 py-2 text-sm font-semibold text-danger">
      <Eye className="size-4 shrink-0" />
      <span>
        Support view: {salonName} — you are acting as this salon. Every visit is
        logged.
      </span>
      <form action={adminStopImpersonation}>
        <Button size="sm" variant="outline" type="submit" className="h-8">
          Exit support view
        </Button>
      </form>
    </div>
  );
}
