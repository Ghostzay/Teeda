import Link from "next/link";
import { ArrowRight, CalendarDays, Coffee, Wallet } from "lucide-react";

import { CalendarNudge } from "@/components/schedule/calendar-nudge";
import { ServiceLog } from "@/components/dashboard/service-log";
import { NotificationsCard } from "@/components/notifications-card";
import { CheckInCard } from "@/components/checkin-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { JobCard } from "@/components/job-card";
import { TurnBoard } from "@/components/turn-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth";
import { formatMoney, formatRelative, formatTime } from "@/lib/format";
import {
  amICheckedIn,
  getJobs,
  getNotifications,
  getTechAppointments,
  getTechCurrentJob,
  getServiceLog,
  getTechEarnings,
  getUnmarkedTechs,
} from "@/lib/queries";
import { getTurnPosition, getTurnQueue } from "@/lib/turn";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * My Turn — the tech's home screen, and deliberately the only thing on it.
 *
 * Check in, see where you stand, accept or pass the client you've been
 * offered, finish the one you're on. Schedule, earnings and skills each have
 * their own page, so this fits a tablet without scrolling.
 */
export default async function TechPage() {
  const session = await requireSession();
  const { userId, profile } = session;

  const [
    isCheckedIn,
    currentJob,
    queue,
    position,
    myWaiting,
    appointments,
    earnings,
    notifications,
    unmarked,
    myDay,
  ] = await Promise.all([
    amICheckedIn(),
    getTechCurrentJob(userId),
    getTurnQueue(session.salon.id),
    getTurnPosition(userId, session.salon.id),
    getJobs({ statuses: ["waiting"], techId: userId }),
    getTechAppointments(userId),
    getTechEarnings(userId),
    getNotifications(5),
    getUnmarkedTechs(7),
    getServiceLog(),
  ]);

  const isBusy = Boolean(currentJob);
  const isNextUp =
    !isBusy && queue.find((entry) => entry.is_checked_in && !entry.is_busy)?.tech_id === userId;
  const offered = myWaiting.length > 0;
  const unread = notifications.filter((item) => !item.read_at).length;
  const nextAppointment = appointments.today[0] ?? appointments.tomorrow[0] ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {!isCheckedIn
              ? "Check in to join today's rotation."
              : isBusy
                ? "You're with a client."
                : offered
                  ? "A client is waiting for you."
                  : isNextUp
                    ? "You're up next."
                    : position.position
                      ? `You're #${position.position} in today's rotation.`
                      : "You're on the rotation."}
          </p>
        </div>
        {unread > 0 ? (
          <a
            href="#alerts"
            className="flex min-h-11 items-center rounded-full bg-accent-default px-4 text-sm font-semibold text-on-accent"
          >
            {unread} new {unread === 1 ? "alert" : "alerts"}
          </a>
        ) : null}
      </header>

      {/* A calendar nobody fills in is worse than none — the desk checks it
          twice, finds it empty, and stops looking. Ask here, where the only
          person who can fix it already is. */}
      <CalendarNudge techs={unmarked} self={{ id: userId }} />

      <CheckInCard isCheckedIn={isCheckedIn} />

      {/* The badge above used to link to /schedule, which shows no alerts at
          all. These are the alerts. */}
      <div id="alerts">
        <NotificationsCard notifications={notifications} />
      </div>

      {/* Turn position, then earnings and next booking as one glanceable row. */}
      {isCheckedIn ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <Card
            className={cn(
              "border-2",
              offered || isNextUp
                ? "border-[var(--status-waiting)]"
                : isBusy
                  ? "border-[var(--status-progress)]"
                  : "border-border",
            )}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <span className="text-3xl font-semibold leading-none tabular-nums">
                  {position.position ? `#${position.position}` : "—"}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                  my turn
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-lg font-semibold leading-tight">
                  {offered
                    ? "Client waiting for you"
                    : isNextUp
                      ? "You're up next"
                      : isBusy
                        ? "With a client"
                        : "Waiting for a turn"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Last turn {formatRelative(position.entry?.last_turn_at)} ·{" "}
                  {position.entry?.jobs_today ?? 0} clients today
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Link href="/earnings" className="rounded-xl">
              <Card className="h-full">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-completed-bg text-completed">
                    <Wallet className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-semibold leading-none tabular-nums">
                      {formatMoney(earnings.today?.tech_total ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">earned today</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/schedule" className="rounded-xl">
              <Card className="h-full">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-progress-bg text-progress">
                    <CalendarDays className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {nextAppointment
                        ? `${formatTime(nextAppointment.scheduled_at)} · ${nextAppointment.customer?.name ?? "Client"}`
                        : "Nothing booked"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {appointments.today.length} today · {appointments.tomorrow.length} tomorrow
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      ) : null}

      {/* The client offered to me: two large, unmistakable choices. */}
      {offered ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Your next client</CardTitle>
          </CardHeader>
          <CardContent>
            <Stagger className="space-y-3">
              {myWaiting.map((job) => (
                <StaggerItem key={job.id}>
                  <JobCard
                job={job}
                techs={[]}
                services={[]}
                splitPercent={session.salon.tech_split_percent}
                canManageFloor={false}
                currentUserId={userId}
                    showTurnActions
                  />
                </StaggerItem>
              ))}
            </Stagger>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Working on now</CardTitle>
        </CardHeader>
        <CardContent>
          {currentJob ? (
            <JobCard
              job={currentJob}
              techs={[]}
              services={[]}
              splitPercent={session.salon.tech_split_percent}
              canManageFloor={false}
              currentUserId={userId}
            />
          ) : (
            <EmptyState
              icon={Coffee}
              title="No client right now"
              description={
                isCheckedIn
                  ? "The front desk will send your next client through the rotation."
                  : "Check in for turns to start receiving clients."
              }
              className="py-6"
            />
          )}
        </CardContent>
      </Card>

      {/* Their own day, and only their own — service_log enforces that in SQL
          rather than trusting what this page asks for. */}
      <ServiceLog entries={myDay} title="My day" personal />

      <TurnBoard queue={queue} highlightTechId={userId} />
    </div>
  );
}
