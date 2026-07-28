"use client";

import { usePathname } from "next/navigation";

import { PageTransition } from "@/components/motion";

/**
 * Runs the page entrance on every route change.
 *
 * Lives in the shell rather than in each page so the transition is consistent
 * and a page never has to remember to opt in.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PageTransition routeKey={pathname} className="mx-auto w-full max-w-6xl">
      {children}
    </PageTransition>
  );
}
