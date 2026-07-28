"use client";

import * as React from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Motion vocabulary for the app.
 *
 * Everything here is under 300ms and every component reads
 * `prefers-reduced-motion` — on a salon tablet that people tap all day, motion
 * has to confirm an action, never delay it.
 */
export const EASE: Transition["ease"] = [0.22, 0.61, 0.36, 1];

const FAST: Transition = { duration: 0.18, ease: EASE };
const BASE: Transition = { duration: 0.24, ease: EASE };

/** Wrap the app once so every nested motion element inherits reduced-motion. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={BASE}>
      {children}
    </MotionConfig>
  );
}

/** Page-level entrance. Keyed on the route so navigation re-runs it. */
export function PageTransition({
  routeKey,
  children,
  className,
}: {
  routeKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={BASE}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Container that staggers its children in on mount. */
export function Stagger({
  children,
  className,
  step = 0.035,
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: reduce ? 0 : step } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** A single staggered row. Must be inside <Stagger>. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 10 },
        shown: { opacity: 1, y: 0, transition: FAST },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Press feedback for cards and custom tap targets. */
export function Pressable({
  children,
  className,
  onClick,
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
} & Omit<React.ComponentProps<typeof motion.button>, "onClick" | "children">) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("text-left", className)}
      whileTap={reduce || disabled ? undefined : { scale: 0.975 }}
      transition={FAST}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

/** Cross-fade used when the schedule swaps between day and week. */
export function ViewSwap({
  viewKey,
  children,
  className,
}: {
  viewKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.995 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.995 }}
        transition={FAST}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export { motion, AnimatePresence, useReducedMotion };
