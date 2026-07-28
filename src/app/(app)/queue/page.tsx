import Link from "next/link";
import { Plus, Scissors, Users } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { WaitTint } from "@/components/live-wait";
import { Button } from "@/components/ui/button";
import { TurnBoard } from "@/components/turn-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFloorAccess } from "@/lib/auth";
import { getActiveJobs, getActiveTechs, getServices } from "@/lib/queries";
import { getTurnQueue } from "@/lib/turn";

export const dynamic = "force-dynamic";

/**
 * Walk-ins — the working screen for the floor.
 *
 * Rotation on the left (it's the product), live clients on the right. Each
 * column scrolls on its own so the board stays put while the desk works
 * through the waiting list.
 */
export default async function QueuePage() {
  const session = await requireFloorAccess();

  const [jobs, techs, queue, services] = await Promise.all([
    getActiveJobs(),
    getActiveTechs(),
    getTurnQueue(session.salon.id),
    getServices(),
  ]);

  const waiting = jobs.filter((job) => job.status === "waiting");
  const inProgress = jobs.filter((job) => job.status === "in_progress");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">Walk-ins</h1>
          <p className="text-sm text-secondary-text">
            Who&apos;s up, who&apos;s working, and who&apos;s waiting.
          </p>
        </div>
        {/* Checking a client in is an action, not a place — so it lives on the
            two screens where you would do it, not in the nav. */}
        <Button asChild size="lg" className="shrink-0">
          <Link href="/jobs">
            <Plus className="size-4" />
            Check in a client
          </Link>
        </Button>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-0">
          <TurnBoard queue={queue} showFloorControls />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Scissors className="size-4 text-progress" />
                With a tech now
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {inProgress.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inProgress.length === 0 ? (
                <EmptyState icon={Scissors} title="No services running right now." className="py-6" />
              ) : (
                <div className="space-y-3">
                  {inProgress.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      techs={techs}
                      services={services}
                      splitPercent={session.salon.tech_split_percent}
                      canManageFloor
                      currentUserId={session.userId}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-waiting" />
                Waiting
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {waiting.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {waiting.length === 0 ? (
                <EmptyState icon={Users} title="Nobody is waiting — the floor is clear." className="py-6" />
              ) : (
                <div className="space-y-3">
                  {waiting.map((job) => (
                    <WaitTint key={job.id} since={job.checked_in_at}>
                      <JobCard
                        job={job}
                        techs={techs}
                        services={services}
                        splitPercent={session.salon.tech_split_percent}
                        canManageFloor
                        currentUserId={session.userId}
                      />
                    </WaitTint>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
