import type { ServiceCategory } from "@/lib/types";

/**
 * What may be booked together.
 *
 * The rule: **one per category, add-ons unlimited.** A visit is one manicure,
 * or one pedicure, or one of each, plus however many add-ons — because that is
 * what a visit is. Two manicures in one basket is not a preference, it is a
 * mis-tap that would book ninety minutes of overlapping work into one slot.
 *
 * Mirrored from `services_basket_is_valid()` in SQL, which is the authority:
 * this file makes the picker swap rather than error, but the RPC re-checks
 * every basket it is given, because the picker runs on a device a customer is
 * holding. If the two ever drift, the database wins and the tablet is merely
 * unhelpful.
 */
export const EXCLUSIVE_CATEGORIES: ServiceCategory[] = [
  "manicure",
  "pedicure",
  "enhancement",
  "wax",
];

/** Whether picking a second service in this category replaces the first. */
export function isExclusive(category: ServiceCategory): boolean {
  return EXCLUSIVE_CATEGORIES.includes(category);
}

type Pickable = { id: string; category: ServiceCategory };

/**
 * Add or remove a service, keeping the basket legal.
 *
 * Tapping an already-picked service removes it. Tapping a new one in an
 * exclusive category *swaps out* whatever was there — deliberately, rather
 * than refusing: a customer who taps "Gel manicure" while "Manicure" is
 * selected has told you which one they want, and an error message would make
 * them work out why.
 */
export function toggleService<T extends Pickable>(basket: T[], service: T): T[] {
  if (basket.some((item) => item.id === service.id)) {
    return basket.filter((item) => item.id !== service.id);
  }

  if (!isExclusive(service.category)) return [...basket, service];

  return [...basket.filter((item) => item.category !== service.category), service];
}

/** Which service this pick would displace, so the screen can say so. */
export function displacedBy<T extends Pickable>(basket: T[], service: T): T | null {
  if (!isExclusive(service.category)) return null;
  if (basket.some((item) => item.id === service.id)) return null;
  return basket.find((item) => item.category === service.category) ?? null;
}

/** The same check the RPC does, for disabling the Continue button. */
export function isBasketValid<T extends Pickable>(basket: T[]): boolean {
  const seen = new Set<ServiceCategory>();
  for (const item of basket) {
    if (!isExclusive(item.category)) continue;
    if (seen.has(item.category)) return false;
    seen.add(item.category);
  }
  return true;
}
