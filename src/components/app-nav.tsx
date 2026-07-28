"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";

import { motion } from "@/components/motion";

import { cn } from "@/lib/utils";
import { navForRole } from "@/lib/navigation";
import type { UserRole } from "@/lib/types";

/** Phone tab bar holds four before it gets cramped; the rest go behind More. */
const PHONE_TABS = 4;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Tablet and desktop navigation: a deep eggplant rail that's always visible.
 *
 * A sidebar rather than a top bar because these roles have up to eight
 * screens — as tabs they'd wrap or truncate, and the salon's primary device
 * is a tablet on a stand where the left edge is easy to reach.
 */
export function Sidebar({ role }: { role: UserRole }) {
  const isActive = useIsActive();
  const items = navForRole(role);

  return (
    <nav className="hidden w-[16.5rem] shrink-0 flex-col gap-1.5 border-r border-ink-border bg-ink p-3 md:flex">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 15px / medium, and a 48px row: readable across a counter,
              // not just at desk distance.
              "relative flex min-h-12 items-center gap-3.5 rounded-lg pl-5 pr-3 text-[0.9375rem] font-medium leading-none transition-colors",
              active
                // Filled surface *and* an accent edge marker — the active item
                // is never signalled by colour alone.
                ? "bg-ink-accent text-ink-foreground font-semibold"
                : "text-ink-muted hover:bg-ink-accent hover:text-ink-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="nav-active-edge"
                className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-primary"
                transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              />
            ) : null}
            <Icon className={cn("size-[1.15rem] shrink-0", active && "text-primary")} />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phone navigation: a fixed bottom bar with big targets, plus a More sheet
 * for roles with more screens than fit.
 */
export function MobileNav({ role }: { role: UserRole }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = useIsActive();
  const items = navForRole(role);

  const needsMore = items.length > PHONE_TABS + 1;
  const tabs = needsMore ? items.slice(0, PHONE_TABS) : items;
  const overflow = needsMore ? items.slice(PHONE_TABS) : [];
  const overflowActive = overflow.some((item) => isActive(item.href));

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="More pages">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMoreOpen(false)}
            aria-label="Close"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {overflow.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-sm font-medium",
                    isActive(href)
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-border bg-ink pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-stretch">
          {tabs.map(({ href, short, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[0.75rem] font-semibold transition-colors",
                  active ? "text-primary" : "text-ink-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg",
                    active && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {short}
              </Link>
            );
          })}

          {overflow.length > 0 ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[0.75rem] font-semibold",
                overflowActive ? "text-primary" : "text-ink-muted",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg",
                  overflowActive && "bg-primary text-primary-foreground",
                )}
              >
                <MoreHorizontal className="size-5" />
              </span>
              More
            </button>
          ) : null}
        </div>
      </nav>
    </>
  );
}
