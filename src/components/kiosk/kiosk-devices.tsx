"use client";

import Link from "next/link";
import { Tablet } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { ResetPasswordButton } from "@/components/kiosk/reset-password-button";
import { setKioskDeviceActive, setKioskExitPin } from "@/lib/actions/kiosk";
import { formatDate } from "@/lib/format";
import type { KioskDevice } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Check-in tablets.
 *
 * A kiosk is an account, not a setting: it signs in once and stays signed in.
 * That is the whole reason the role exists rather than reusing an admin login
 * — an admin session left on a tablet by the door is the salon's takings on a
 * tablet by the door.
 */
export function KioskDevices({
  devices,
  hasExitPin,
}: {
  devices: KioskDevice[];
  hasExitPin: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Tablet className="size-4 text-accent-default" />
          Check-in tablets ({devices.length})
        </CardTitle>
        <CardDescription>
          A tablet clients use to check themselves in and book. It can look
          someone up by their full phone number — nothing else. It cannot see
          your client list, your calendar or any money.
          {" "}
          <Link href="/staff" className="font-medium text-accent-default underline">
            Add one on the Team page
          </Link>{" "}
          by creating a staff account with the role set to Kiosk device. Name it
          after where it sits — that name is what the tablet shows.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {devices.length === 0 ? (
          <p className="rounded-xl border border-subtle bg-surface-sunken px-4 py-6 text-center text-sm text-muted-text">
            No tablets yet.
          </p>
        ) : (
          <ul className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle">
            {devices.map((device) => (
              <li
                key={device.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3",
                  !device.is_active && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {device.label}
                    {device.entered_kiosk_mode_at ? (
                      <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-meta font-semibold text-accent-default">
                        In kiosk mode
                      </span>
                    ) : null}
                  </p>
                  <p className="text-meta text-muted-text">
                    {device.last_sign_in_at
                      ? `Last signed in ${formatDate(device.last_sign_in_at)}`
                      : "Not signed in yet"}
                    {device.is_active ? "" : " · switched off"}
                  </p>
                </div>
                <ResetPasswordButton deviceId={device.id} label={device.label} />
                <ActionButton
                  action={setKioskDeviceActive}
                  fields={{ id: device.id, is_active: device.is_active ? "false" : "true" }}
                  variant={device.is_active ? "outline" : "default"}
                  confirm={
                    device.is_active
                      ? `Switch off ${device.label}? It stops working on its next tap — you do not need the tablet in your hand.`
                      : undefined
                  }
                >
                  {device.is_active ? "Switch off" : "Switch on"}
                </ActionButton>
              </li>
            ))}
          </ul>
        )}

        {/* The exit steps, in front of the manager who will be phoned about
            them. Someone always forgets, and the person who forgets is rarely
            the person who started it. */}
        <div className="rounded-xl border border-subtle bg-surface-sunken p-4 text-sm">
          <p className="font-semibold">Leaving kiosk mode on a tablet</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-secondary-text">
            <li>Tap the salon name, top-left of the tablet, five times within three seconds.</li>
            <li>Enter the manager PIN below.</li>
          </ol>
        </div>

        <ActionForm
          action={setKioskExitPin}
          resetOnSuccess
          className="space-y-1.5 rounded-xl border border-subtle bg-surface-sunken p-4"
        >
          <Label htmlFor="kiosk_pin">Manager PIN {hasExitPin ? "(set)" : "(not set)"}</Label>
          <div className="flex gap-2">
            <Input
              id="kiosk_pin"
              name="pin"
              inputMode="numeric"
              placeholder="4 to 6 digits"
              autoComplete="off"
            />
            <SubmitButton>Save</SubmitButton>
          </div>
          <p className="text-meta text-muted-text">
            Five wrong tries locks that tablet out for five minutes. Kiosk mode will not start
            at all until this is set — a tablet with no PIN has no way out of it.
          </p>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
