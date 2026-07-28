import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { createSalon } from "@/lib/actions/commission";
import { requireManager } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Salon provisioning — the owner's exclusive right.
 *
 * Creating a salon here does not move you into it: this session stays scoped
 * to your own salon_id. A new location is handed to a manager, who signs in
 * against it.
 */
export default async function SalonsPage() {
  const session = await requireManager();
  if (!session.isSuperAdmin) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Salons</h1>
        <p className="text-sm text-muted-foreground">
          Only the owner can create a salon.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            {session.salon.name}
          </CardTitle>
          <CardDescription>
            Your salon, since {formatDate(session.salon.created_at)}. You&apos;re signed in here.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Open another location</CardTitle>
          <CardDescription>
            Creates the salon. Add its manager from Staff once you switch to it — this session
            stays with {session.salon.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createSalon} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="salon_new_name">Salon name</Label>
              <Input
                id="salon_new_name"
                name="name"
                placeholder="Polished — Northside"
                required
                autoComplete="off"
              />
            </div>
            <SubmitButton size="lg">Create salon</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
