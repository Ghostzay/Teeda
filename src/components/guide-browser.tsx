"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";

import { Pressable, Stagger, StaggerItem, ViewSwap } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Bi, GuideBadge, GuideSection } from "@/lib/guide-content";

/** Guide tones map onto the app's real badge variants. */
const BADGE_VARIANT: Record<GuideBadge["tone"], "waiting" | "in_progress" | "completed" | "cancelled"> = {
  waiting: "waiting",
  progress: "in_progress",
  completed: "completed",
  muted: "cancelled",
};

/**
 * Sectioned, navigable help — a list of screens on the left, one screen's
 * guide on the right. Deliberately not one long page: a manager looking up
 * "how do I delete a service" should be two taps away, not scrolling.
 */
export function GuideBrowser({ sections }: { sections: GuideSection[] }) {
  const [activeId, setActiveId] = React.useState(sections[0]?.id ?? "");
  const active = sections.find((section) => section.id === activeId) ?? sections[0];

  if (!active) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <nav aria-label="Guide sections" className="lg:sticky lg:top-0 lg:self-start">
        <Stagger className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {sections.map((section) => {
            const isActive = section.id === active.id;
            return (
              <StaggerItem key={section.id} className="shrink-0 lg:w-full">
                <Pressable
                  onClick={() => setActiveId(section.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "relative flex min-h-12 w-full items-center rounded-xl border px-4 py-3 text-[0.9375rem] font-medium transition-colors",
                    isActive
                      ? "border-primary/50 bg-primary-soft/50 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive ? (
                    <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />
                  ) : null}
                  <span className="truncate">
                    {section.title.en}
                    <span className="ml-2 text-meta opacity-70">{section.title.vi}</span>
                  </span>
                </Pressable>
              </StaggerItem>
            );
          })}
        </Stagger>
      </nav>

      <ViewSwap viewKey={active.id}>
        <article className="space-y-4">
          <Card className="edge-gold surface-raised">
            <CardContent className="space-y-3 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-title">{active.title.en}</h2>
                  <p className="text-sm text-muted-foreground">{active.title.vi}</p>
                </div>
                <Link
                  href={active.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent"
                >
                  Open screen
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
              <Para copy={active.purpose} />
            </CardContent>
          </Card>

          {active.add ? (
            <Block icon={Plus} title="Adding a record" viTitle="Thêm mới">
              <Para copy={active.add.intro} muted />
              <ol className="mt-3 space-y-2">
                {active.add.steps.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-meta font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block text-sm">{step.action.en}</span>
                      <span className="block text-sm text-muted-foreground">{step.action.vi}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Block>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {active.edit ? (
              <Block icon={Pencil} title="Editing" viTitle="Sửa">
                <Para copy={active.edit} />
              </Block>
            ) : null}
            {active.remove ? (
              <Block icon={Trash2} title="Deleting" viTitle="Xóa">
                <Para copy={active.remove} />
              </Block>
            ) : null}
          </div>

          {active.badges ? (
            <Block icon={Check} title="What the badges mean" viTitle="Ý nghĩa nhãn trạng thái">
              <ul className="space-y-3">
                {active.badges.map((badge) => (
                  <li key={badge.label.en} className="flex flex-wrap items-start gap-3">
                    <Badge variant={BADGE_VARIANT[badge.tone]}>
                      {badge.label.en}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{badge.meaning.en}</span>
                      <span className="block text-sm text-muted-foreground">{badge.meaning.vi}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          <Block icon={CircleAlert} title="Easy to get wrong" viTitle="Dễ nhầm" tone="warn">
            <ul className="space-y-3">
              {active.gotchas.map((gotcha, index) => (
                <li key={index}>
                  <p className="text-sm">{gotcha.en}</p>
                  <p className="text-sm text-muted-foreground">{gotcha.vi}</p>
                </li>
              ))}
            </ul>
          </Block>
        </article>
      </ViewSwap>
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  viTitle,
  tone,
  children,
}: {
  icon: typeof Plus;
  title: string;
  viTitle: string;
  tone?: "warn";
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(tone === "warn" && "border-progress/40")}>
      <CardContent className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
          <Icon className={cn("size-4", tone === "warn" ? "text-progress" : "text-primary")} />
          {title}
          <span className="font-normal normal-case tracking-normal text-muted-foreground">
            · {viTitle}
          </span>
        </h3>
        {children}
      </CardContent>
    </Card>
  );
}

function Para({ copy, muted }: { copy: Bi; muted?: boolean }) {
  return (
    <div>
      <p className={cn("text-sm", muted && "text-muted-foreground")}>{copy.en}</p>
      <p className="text-sm text-muted-foreground">{copy.vi}</p>
    </div>
  );
}
