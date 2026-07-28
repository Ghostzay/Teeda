"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, ListChecks, Settings, User, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const FLOOR_LINKS = [
  { href: "/dashboard", label: "Floor", icon: LayoutDashboard },
  { href: "/jobs", label: "Check in", icon: ListChecks },
  { href: "/appointments", label: "Booked", icon: CalendarDays },
  { href: "/customers", label: "Clients", icon: Users },
];

const SETTINGS_LINK = { href: "/settings", label: "Settings", icon: Settings };

/** Techs get two screens: their turn, and the client book (read-only). */
const TECH_LINKS = [
  { href: "/tech", label: "My turn", icon: User },
  { href: "/customers", label: "Clients", icon: Users },
];

/**
 * Desktop: inline links in the header.
 * Mobile/tablet: a fixed bottom tab bar with 56px targets — the salon's
 * primary device is a tablet on a stand, so navigation lives under the thumb.
 */
export function AppNav({
  canManageFloor,
  isManager,
  variant,
}: {
  canManageFloor: boolean;
  isManager: boolean;
  variant: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  // Admins run the floor but never see Settings.
  const links = canManageFloor
    ? isManager
      ? [...FLOOR_LINKS, SETTINGS_LINK]
      : FLOOR_LINKS
    : TECH_LINKS;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "desktop") {
    return (
      <nav className="hidden items-center gap-1 sm:flex">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-6xl items-stretch">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              isActive(href) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
