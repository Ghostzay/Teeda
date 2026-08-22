"use client";

import { Eye, Pause, Play, Plus, Store } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { adminCreateSalon, adminImpersonate, adminSetSuspended } from "@/lib/actions/admin";
import type { SalonHealth } from "@/lib/actions/admin";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The whole console: create, list-with-health, suspend, impersonate. */
export function AdminConsole({ salons }: { salons: SalonHealth[] }) {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4 text-accent-default" />
            New salon
          </CardTitle>
          <CardDescription>
            Creates the salon and emails its first owner an invite — they set
            their own password from the link. The subdomain is derived from the
            name unless you choose one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={adminCreateSalon} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new_name">Salon name</Label>
              <Input id="new_name" name="name" placeholder="Lotus Nails & Spa" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_slug">Subdomain (optional)</Label>
              <Input id="new_slug" name="slug" placeholder="lotus-nails" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_owner_email">Owner email</Label>
              <Input id="new_owner_email" name="owner_email" type="email" placeholder="owner@lotusnails.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_owner_name">Owner name</Label>
              <Input id="new_owner_name" name="owner_name" placeholder="Kim Pham" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton>Create and invite</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Store className="size-4 text-accent-default" />
            Salons ({salons.length})
          </CardTitle>
          <CardDescription>
            Support view opens the salon exactly as its owner sees it, with a
            banner on every screen and an audit entry for every visit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {salons.length === 0 ? (
            <p className="rounded-xl border border-subtle bg-surface-sunken px-4 py-6 text-center text-sm text-muted-text">
              No salons yet.
            </p>
          ) : (
            <ul className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle">
              {salons.map((salon) => (
                <li
                  key={salon.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-3",
                    salon.suspended_at && "opacity-70",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {salon.name}
                      <span className="text-meta text-muted-text">{salon.slug}</span>
                      {salon.suspended_at ? (
                        <span className="rounded-full bg-warning-bg px-2 py-0.5 text-meta font-semibold text-warning">
                          Suspended
                        </span>
                      ) : null}
                    </p>
                    <p className="text-meta text-muted-text">
                      {salon.staff} active staff
                      {" · "}
                      {salon.last_activity
                        ? `last activity ${formatDate(salon.last_activity)}`
                        : "no activity yet"}
                    </p>
                  </div>

                  <form action={adminImpersonate}>
                    <input type="hidden" name="salon_id" value={salon.id} />
                    <Button variant="outline" size="sm" type="submit">
                      <Eye className="size-4" />
                      Support view
                    </Button>
                  </form>

                  <ActionButton
                    action={adminSetSuspended}
                    fields={{ salon_id: salon.id, suspend: salon.suspended_at ? "false" : "true" }}
                    variant={salon.suspended_at ? "default" : "outline"}
                    size="sm"
                    confirm={
                      salon.suspended_at
                        ? undefined
                        : `Suspend ${salon.name}? Their staff see a status screen until you reactivate. Nothing is deleted.`
                    }
                  >
                    {salon.suspended_at ? (
                      <>
                        <Play className="size-4" />
                        Reactivate
                      </>
                    ) : (
                      <>
                        <Pause className="size-4" />
                        Suspend
                      </>
                    )}
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
