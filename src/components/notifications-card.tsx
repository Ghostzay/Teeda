import { Bell, CalendarClock, CalendarX, UserPlus } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/lib/types";

const ICON: Record<NotificationType, typeof Bell> = {
  appointment_assigned: CalendarClock,
  appointment_changed: CalendarClock,
  appointment_cancelled: CalendarX,
  job_assigned: UserPlus,
};

/**
 * In-app alerts — currently bookings landing on a tech's book, and clients
 * put in front of them. Written by database triggers, so a tech is told
 * however the change was made.
 */
export function NotificationsCard({ notifications }: { notifications: AppNotification[] }) {
  const unread = notifications.filter((item) => !item.read_at);
  if (notifications.length === 0) return null;

  return (
    <Card className={cn(unread.length > 0 && "border-2 border-[var(--status-progress)]")}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          Alerts
          {unread.length > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unread.length}
            </span>
          ) : null}
        </CardTitle>

        {unread.length > 0 ? (
          <ActionButton action={markNotificationsRead} fields={{}} variant="ghost" size="sm" silentSuccess>
            Mark all read
          </ActionButton>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {notifications.slice(0, 6).map((item) => {
            const Icon = ICON[item.type];
            const isUnread = !item.read_at;

            return (
              <li
                key={item.id}
                className={cn("flex items-start gap-3 px-4 py-3", isUnread && "bg-progress-bg/40")}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                    isUnread ? "bg-progress-bg text-progress" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm leading-tight", isUnread ? "font-semibold" : "font-medium")}>
                    {item.title}
                  </p>
                  {item.body ? (
                    <p className="truncate text-sm text-muted-foreground">{item.body}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{formatRelative(item.created_at, "just now")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
