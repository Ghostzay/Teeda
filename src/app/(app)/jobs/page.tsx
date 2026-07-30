import Link from "next/link";
import { ClipboardList, Footprints } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { JobForm } from "@/components/job-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFloorAccess } from "@/lib/auth";
import { getActiveTechs, getJobs, getServiceMenu } from "@/lib/queries";
import { suggestNextTechDetailed } from "@/lib/turn";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", label: "Open", statuses: ["waiting", "in_progress"] as JobStatus[] },
  { key: "waiting", label: "Waiting", statuses: ["waiting"] as JobStatus[] },
  { key: "in_progress", label: "In progress", statuses: ["in_progress"] as JobStatus[] },
  { key: "completed", label: "Completed", statuses: ["completed"] as JobStatus[] },
  { key: "all", label: "All", statuses: undefined },
] as const;

/**
 * Walk-in check-in — a front-desk screen. Techs never land here; booked
 * clients are checked in from /appointments instead.
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireFloorAccess();
  const { filter = "open" } = await searchParams;

  const active = FILTERS.find((option) => option.key === filter) ?? FILTERS[0];

  const [jobs, techs, services, suggestion] = await Promise.all([
    getJobs({
      statuses: active.statuses ? [...active.statuses] : undefined,
      todayOnly: active.key === "completed" || active.key === "all",
    }),
    getActiveTechs(),
    getServiceMenu(),
    suggestNextTechDetailed(session.salon.id),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Check in a walk-in</h1>
        <p className="text-sm text-muted-foreground">
          For clients with a booking, use{" "}
          <Link href="/appointments" className="font-medium text-primary underline-offset-4 hover:underline">
            Appointments
          </Link>{" "}
          instead — checking one in there keeps it linked to the booking.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Footprints className="size-4 text-primary" />
              New walk-in
            </CardTitle>
            <CardDescription>
              The rotation picks the tech unless you choose one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobForm
              techs={techs}
              services={services}
              salonId={session.salon.id}
              suggestedTechName={suggestion.tech?.full_name ?? null}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <Link
                key={option.key}
                href={`/jobs?filter=${option.key}`}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                  option.key === active.key
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>

          {jobs.length === 0 ? (
            <Card>
              <EmptyState
                icon={ClipboardList}
                title={`No ${active.label.toLowerCase()} jobs`}
                description="Check a client in from the form to get started."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
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
        </div>
      </div>
    </div>
  );
}
