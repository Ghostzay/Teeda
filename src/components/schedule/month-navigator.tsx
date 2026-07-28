"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MonthView, type TechOption } from "@/components/schedule/month-view";
import { Button } from "@/components/ui/button";
import type { DayAvailability } from "@/lib/types";

function shiftMonth(dateStr: string, delta: number): string {
  const [year, month] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-01`;
}

/**
 * Month paging and the jump into a single day.
 *
 * Split from `MonthView` so the grid itself stays a pure rendering component —
 * it takes days and gives back a date, and knows nothing about routing.
 */
export function MonthNavigator({
  dateStr,
  days,
  techs,
  currentUserId,
  canManageFloor,
}: {
  dateStr: string;
  days: DayAvailability[];
  techs: TechOption[];
  currentUserId: string;
  canManageFloor: boolean;
}) {
  const router = useRouter();
  const [year, month, day] = dateStr.split("-").map(Number);
  const anchor = new Date(year, month - 1, day);

  const go = (next: string) => router.push(`/schedule?view=month&date=${next}`);

  const todayStr = (() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${mm}-${dd}`;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => go(shiftMonth(dateStr, -1))}>
          <ChevronLeft className="size-4" />
          <span className="sr-only">Previous month</span>
        </Button>
        <Button variant="outline" size="icon" onClick={() => go(shiftMonth(dateStr, 1))}>
          <ChevronRight className="size-4" />
          <span className="sr-only">Next month</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(todayStr)}>
          Today
        </Button>
        <p className="ml-auto text-sm font-semibold">
          {anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      <MonthView
        anchor={anchor}
        days={days}
        techs={techs}
        currentUserId={currentUserId}
        canManageFloor={canManageFloor}
        onOpenDay={(chosen) => router.push(`/schedule?view=day&date=${chosen}`)}
      />
    </div>
  );
}
