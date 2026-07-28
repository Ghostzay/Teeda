import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ClipboardCheck,
  Crown,
  LayoutDashboard,
  ListOrdered,
  Receipt,
  Scissors,
  Settings,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
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
 * Each role gets its own set of screens. The lists are deliberately short:
 * one page, one job, so nothing needs long scrolling on a tablet.
 *
 * Order matters — the first four appear in the phone tab bar, the rest go
 * behind "More".
 */
const MANAGER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { href: "/queue", label: "Turns & Queue", short: "Queue", icon: ListOrdered },
  { href: "/jobs", label: "Jobs & Check-ins", short: "Check in", icon: ClipboardCheck },
  { href: "/appointments", label: "Appointments", short: "Booked", icon: CalendarDays },
  { href: "/services", label: "Services & Pricing", short: "Services", icon: Scissors },
  { href: "/staff", label: "Staff & Techs", short: "Staff", icon: Users },
  { href: "/earnings", label: "Earnings & Reports", short: "Earnings", icon: TrendingUp },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { href: "/queue", label: "Turns & Queue", short: "Queue", icon: ListOrdered },
  { href: "/jobs", label: "Check-in / New Job", short: "Check in", icon: ClipboardCheck },
  { href: "/appointments", label: "Appointments", short: "Booked", icon: CalendarDays },
  { href: "/payments", label: "Payments", short: "Payments", icon: Receipt },
];

const TECH_NAV: NavItem[] = [
  { href: "/tech", label: "My Turn", short: "My turn", icon: Crown },
  { href: "/schedule", label: "My Schedule", short: "Schedule", icon: CalendarDays },
  { href: "/earnings", label: "My Earnings", short: "Earnings", icon: Wallet },
  { href: "/profile", label: "Profile & Skills", short: "Profile", icon: UserCog },
];

export function navForRole(role: UserRole): NavItem[] {
  if (role === "manager") return MANAGER_NAV;
  if (role === "admin") return ADMIN_NAV;
  return TECH_NAV;
}

/** Where each role lands after signing in. */
export function homeForRole(role: UserRole): string {
  return role === "tech" ? "/tech" : "/dashboard";
}
