import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { JobForm } from "@/components/job-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth";
import { getActiveTechs, getCustomerOptions, getJobs } from "@/lib/queries";
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

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; mine?: string }>;
}) {
  const session = await requireSession();
  const { filter = "open", mine } = await searchParams;

  const active = FILTERS.find((option) => option.key === filter) ?? FILTERS[0];
  const onlyMine = mine === "1" || !session.isManager;

  const [jobs, customers, techs, suggestion] = await Promise.all([
    getJobs({
      statuses: active.statuses ? [...active.statuses] : undefined,
      techId: onlyMine ? session.userId : undefined,
      todayOnly: active.key === "completed" || active.key === "all",
    }),
    getCustomerOptions(),
    getActiveTechs(),
    suggestNextTechDetailed(session.salon.id),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Check in walk-ins and track every service on the floor.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader>
            <CardTitle>New check-in</CardTitle>
          </CardHeader>
          <CardContent>
            <JobForm
              customers={customers}
              techs={techs}
              salonId={session.salon.id}
              suggestedTechName={suggestion.tech?.full_name ?? null}
              isManager={session.isManager}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <Link
                key={option.key}
                href={`/jobs?filter=${option.key}${mine === "1" ? "&mine=1" : ""}`}
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
            {session.isManager ? (
              <Link
                href={`/jobs?filter=${active.key}${mine === "1" ? "" : "&mine=1"}`}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                  mine === "1"
                    ? "border-transparent bg-secondary text-secondary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                Only mine
              </Link>
            ) : null}
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
                  isManager={session.isManager}
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
