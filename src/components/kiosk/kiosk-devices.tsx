"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tablet } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { addKioskDevice, setKioskDeviceActive, setKioskExitPin } from "@/lib/actions/kiosk";
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
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Tablet className="size-4 text-accent-default" />
            Check-in tablets ({devices.length})
          </CardTitle>
          <CardDescription>
            A tablet clients use to check themselves in. It can look someone up by their full
            phone number and check them in — nothing else. It cannot see your client list, your
            calendar or any money.
          </CardDescription>
        </div>
        <Button type="button" size="lg" onClick={() => setAdding((value) => !value)}>
          <Plus className="size-4" />
          Add tablet
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {adding ? (
          <ActionForm
            action={addKioskDevice}
            onSuccess={() => {
              setAdding(false);
              router.refresh();
            }}
            className="space-y-3 rounded-xl border border-subtle bg-surface-sunken p-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="kiosk_label">Where is it?</Label>
              <Input
                id="kiosk_label"
                name="label"
                placeholder="Front desk iPad"
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kiosk_password">Device passphrase</Label>
              <Input
                id="kiosk_password"
                name="password"
                type="password"
                minLength={12}
                placeholder="At least 12 characters"
                required
                autoComplete="new-password"
              />
              <p className="text-meta text-muted-text">
                You type this on the tablet once. It then stays signed in — write it down
                somewhere the staff can find it, not on the tablet.
              </p>
            </div>
            <SubmitButton size="lg" className="w-full">
              Create the device account
            </SubmitButton>
          </ActionForm>
        ) : null}

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
                  <p className="truncate font-medium">{device.label}</p>
                  <p className="text-meta text-muted-text">
                    {device.last_seen_at
                      ? `Last used ${formatDate(device.last_seen_at)}`
                      : "Not signed in yet"}
                    {device.is_active ? "" : " · switched off"}
                  </p>
                </div>
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
              placeholder="4 to 8 digits"
              autoComplete="off"
            />
            <SubmitButton>Save</SubmitButton>
          </div>
          <p className="text-meta text-muted-text">
            Five taps on the salon name at the top of the kiosk, then this PIN, signs the tablet
            out. Without a PIN set there is no way out of the kiosk on the device itself.
          </p>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
