"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";

import { motion } from "@/components/motion";

import { cn } from "@/lib/utils";
import { navForRole, navItemsForRole } from "@/lib/navigation";
import type { UserRole } from "@/lib/types";

/** Phone tab bar holds four before it gets cramped; the rest go behind More. */
const PHONE_TABS = 4;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Tablet and desktop navigation: a rail that's always visible.
 *
 * Grouped rather than flat. The active item is the brightest thing in the rail
 * — a filled surface, a heavier weight and an accent edge — while its siblings
 * stay one step down. Section headings do the finding; nothing needed to get
 * larger for that to work.
 */
export function Sidebar({ role }: { role: UserRole }) {
  const isActive = useIsActive();
  const groups = navForRole(role);

  return (
    <nav className="hidden w-[16.5rem] shrink-0 flex-col gap-1 overflow-y-auto border-r border-subtle bg-surface-sunken p-3 md:flex">
      {groups.map((group, index) => (
        <div key={group.label ?? `group-${index}`} className={cn(index > 0 && "mt-4")}>
          {group.label ? (
            <p className="px-5 pb-1.5 text-meta font-semibold uppercase text-muted-text">
              {group.label}
            </p>
          ) : (
            // An unheaded group still needs to read as separate.
            <div className="mx-3 mb-3 border-t border-subtle" aria-hidden />
          )}

          <div className="flex flex-col gap-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // 15px / medium on a 48px row: readable across a counter,
                    // not just at desk distance.
                    "relative flex min-h-12 items-center gap-3.5 rounded-lg pl-5 pr-3 text-[0.9375rem] leading-none transition-colors",
                    active
                      ? "bg-surface-overlay font-semibold text-primary-text"
                      : "font-medium text-secondary-text hover:bg-surface-overlay hover:text-primary-text",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active-edge"
                      className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-accent-default"
                      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
                    />
                  ) : null}
                  <Icon
                    className={cn("size-[1.15rem] shrink-0", active && "text-accent-default")}
                  />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Phone navigation: a fixed bottom bar with big targets, plus a More sheet
 * for roles with more screens than fit. Groups are flattened here — a five-item
 * bar has no room for headings, and the order already carries the grouping.
 */
export function MobileNav({ role }: { role: UserRole }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = useIsActive();
  const items = navItemsForRole(role);

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
            className="absolute inset-0 bg-surface-sunken/80"
            onClick={() => setMoreOpen(false)}
            aria-label="Close"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-default bg-surface-raised p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex size-11 items-center justify-center rounded-lg text-muted-text hover:bg-surface-overlay"
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
                      ? "border-transparent bg-accent-default text-on-accent"
                      : "border-subtle bg-surface-raised text-primary-text",
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-surface-sunken pb-[env(safe-area-inset-bottom)] md:hidden">
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
                  active ? "text-accent-default" : "text-secondary-text",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg",
                    active && "bg-accent-default text-on-accent",
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
                overflowActive ? "text-accent-default" : "text-secondary-text",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg",
                  overflowActive && "bg-accent-default text-on-accent",
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
