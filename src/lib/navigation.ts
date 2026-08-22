import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  Crown,
  LayoutDashboard,
  Receipt,
  Scissors,
  Settings,
  Contact,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  Shield,
} from "lucide-react";

import type { UserRole } from "@/lib/types";

export type NavItem = {
  href: string;
  label: string;
  /** Bottom-bar label — must fit a phone tab. */
  short: string;
  icon: LucideIcon;
};

/**
 * Navigation is grouped, not a flat list.
 *
 * Eleven identical rows gave the eye nothing to anchor on: every label was the
 * same weight and colour, so finding a screen meant reading all of them. The
 * sections do that work instead — you look in Floor or you look in Business.
 *
 * `label: null` marks an unheaded group. The trailing pair (Get started,
 * Settings) sits apart without pretending to be a category.
 */
export type NavGroup = {
  label: string | null;
  items: NavItem[];
};

/**
 * The Dashboard *is* the walk-in queue — the two were separate screens and the
 * abstract one restated numbers the working one already showed.
 *
 * Names are chosen to separate two axes a non-technical owner actually thinks
 * in — clients vs staff, and now vs later:
 *
 *   Walk-ins     clients here now, and the turn order
 *   Bookings     clients booked for later
 *   Staff hours  which techs are working when
 *
 * "Turns & Queue", "Appointments" and "Schedule" all read as the same concept
 * to someone who does not already know the data model.
 */
const MANAGER_NAV: NavGroup[] = [
  {
    label: "Floor",
    items: [
      { href: "/dashboard", label: "Dashboard", short: "Today", icon: LayoutDashboard },
      { href: "/appointments", label: "Bookings", short: "Booked", icon: CalendarDays },
      { href: "/schedule", label: "Staff hours", short: "Hours", icon: CalendarClock },
      { href: "/customers", label: "Clients", short: "Clients", icon: Contact },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/services", label: "Services & prices", short: "Services", icon: Scissors },
      { href: "/staff", label: "Team", short: "Team", icon: UserCog },
      { href: "/earnings", label: "Reports", short: "Reports", icon: TrendingUp },
    ],
  },
  {
    label: null,
    items: [
      { href: "/guide", label: "Get started", short: "Guide", icon: BookOpen },
      { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
    ],
  },
];

const ADMIN_NAV: NavGroup[] = [
  {
    label: "Floor",
    items: [
      { href: "/dashboard", label: "Dashboard", short: "Today", icon: LayoutDashboard },
      { href: "/appointments", label: "Bookings", short: "Booked", icon: CalendarDays },
      { href: "/schedule", label: "Staff hours", short: "Hours", icon: CalendarClock },
    ],
  },
  {
    label: "Business",
    items: [{ href: "/payments", label: "Payments", short: "Payments", icon: Receipt }],
  },
];

const TECH_NAV: NavGroup[] = [
  {
    label: "Floor",
    items: [
      { href: "/tech", label: "My turn", short: "My turn", icon: Crown },
      { href: "/schedule", label: "My hours", short: "Hours", icon: CalendarClock },
    ],
  },
  {
    label: null,
    items: [
      { href: "/earnings", label: "My earnings", short: "Earnings", icon: Wallet },
      { href: "/profile", label: "Profile & skills", short: "Profile", icon: UserCog },
    ],
  },
];

export function navForRole(role: UserRole): NavGroup[] {
  // The platform admin inside a salon (support view) sees the owner's
  // screens, plus the way back to the console.
  if (role === "super_admin") {
    return [
      { label: "Platform", items: [{ href: "/admin", label: "Platform console", short: "Platform", icon: Shield }] },
      ...MANAGER_NAV,
    ];
  }
  if (role === "manager") return MANAGER_NAV;
  if (role === "admin") return ADMIN_NAV;
  // A kiosk has no navigation at all — it renders its own shell and never the
  // app's. Returning the tech's menu by falling through would put a link to
  // the earnings screen one stray render away from a customer's hands.
  if (role === "kiosk") return [];
  return TECH_NAV;
}

/** Flattened, in order — for the phone tab bar, which has no room for groups. */
export function navItemsForRole(role: UserRole): NavItem[] {
  return navForRole(role).flatMap((group) => group.items);
}

/** Where each role lands after signing in. */
export function homeForRole(role: UserRole): string {
  // Named cases, not "everything that isn't a tech". The default branch is
  // where a new role silently lands, and for a kiosk that default was the
  // dashboard — the one screen it exists to never show.
  // The lobby, not the customer-facing screen: signing in should make you
  // staff holding a tablet, not a tablet.
  if (role === "kiosk") return "/kiosk/ready";
  if (role === "tech") return "/tech";
  // The platform admin's home is the console, not a salon's dashboard.
  if (role === "super_admin") return "/admin";
  return "/dashboard";
}
