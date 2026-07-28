"use client";

import { useState } from "react";
import { CalendarOff } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { blockTime } from "@/lib/actions/schedule";
import { SCHEDULE_BUFFER_MINUTES, type Profile } from "@/lib/types";

/**
 * Hold hours out of a day — lunch, an appointment elsewhere, a half day.
 *
 * A tech can only block their own time; the front desk picks anyone. The
 * database refuses overlaps once buffers are applied, so a clash comes back
 * as a plain message.
 */
export function BlockTimeDialog({
  techs,
  defaultTechId,
  defaultDate,
  canPickTech,
}: {
  techs: Pick<Profile, "id" | "full_name">[];
  defaultTechId: string;
  defaultDate: string;
  canPickTech: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <CalendarOff className="size-4" />
          Block time
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block out time</DialogTitle>
          <DialogDescription>
            Holds the slot so nothing can be booked into it. A{" "}
            {SCHEDULE_BUFFER_MINUTES}-minute buffer is added either side.
          </DialogDescription>
        </DialogHeader>

        <ActionForm
          action={blockTime}
          resetOnSuccess={false}
          onSuccess={() => setOpen(false)}
          className="space-y-4"
        >
          {canPickTech ? (
            <div className="space-y-1.5">
              <Label htmlFor="block_tech">Tech</Label>
              <Select id="block_tech" name="tech_id" defaultValue={defaultTechId}>
                {techs.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <input type="hidden" name="tech_id" value={defaultTechId} />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="block_date">Date</Label>
            <Input id="block_date" name="date" type="date" defaultValue={defaultDate} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="block_start">From</Label>
              <Input id="block_start" name="start_time" type="time" defaultValue="12:00" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block_end">To</Label>
              <Input id="block_end" name="end_time" type="time" defaultValue="13:00" required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="block_kind">Reason</Label>
            <Select id="block_kind" name="kind" defaultValue="break">
              <option value="break">Break</option>
              <option value="unavailable">Unavailable</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="block_title">Label (optional)</Label>
            <Input id="block_title" name="title" placeholder="Lunch" autoComplete="off" />
          </div>

          <SubmitButton size="lg" className="w-full">
            Block it out
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
