"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Table = "jobs" | "profiles" | "appointments";

/**
 * The only always-on client component in the app.
 *
 * Server Components render every screen; this subscribes to Postgres changes
 * for the salon and calls `router.refresh()` so the server re-renders with
 * fresh data. That keeps the queue live on every tablet in the shop without
 * mirroring the database into client state.
 *
 * RLS applies to the replication stream too, so a tech only receives events
 * for rows they are allowed to see.
 */
export function RealtimeRefresher({
  salonId,
  tables = ["jobs", "profiles", "appointments"],
}: {
  salonId: string;
  tables?: Table[];
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // A single status change can fan out into several row events (job +
    // profile). Coalesce them into one refresh.
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 120);
    };

    const channel = supabase.channel(`salon:${salonId}`);

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `salon_id=eq.${salonId}` },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    // Coming back from a locked tablet: re-sync immediately.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
    // `tables` is a stable literal per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, router]);

  return null;
}
