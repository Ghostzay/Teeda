import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The Zolvora identity, as components.
 *
 * Two renderings, one rule each:
 *
 *   ZolvoraMark  the monochrome Z, inline SVG on currentColor — it takes the
 *                theme's token like any icon, so it works at 20px in a header
 *                in every theme without carrying its own gold.
 *   ZolvoraLogo  the full-colour faceted mark from /brand/logo.svg, for the
 *                surfaces that ARE the brand moment: login, the kiosk, covers.
 *
 * Nothing else in the app should reach for the SVG files directly; these two
 * are the door.
 */

export function ZolvoraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-5", className)}>
      <g fill="currentColor">
        <polygon points="20,14 82,14 82,28 55,28 20,28" />
        <polygon points="66,28 82,28 34,72 18,72" />
        <polygon points="18,72 80,72 80,86 18,86" />
      </g>
      <path d="M 58 66 L 67 55.5 L 76 66" fill="none" stroke="currentColor" strokeWidth="6" />
    </svg>
  );
}

export function ZolvoraLogo({
  className,
  size = 96,
  priority = false,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/logo.svg"
      alt="Zolvora"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}

/** The wordmark: display face, wide tracking, always caps. */
export function ZolvoraWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-title tracking-[0.14em]", className)} translate="no">
      ZOLVORA
    </span>
  );
}
