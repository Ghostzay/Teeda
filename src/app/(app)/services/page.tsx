import { ServiceManager } from "@/components/service-manager";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePaySettings } from "@/lib/actions/services";
import { requireManager } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { getServices } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Services & pricing — the salon's menu, plus how the take is split. */
export default async function ServicesPage() {
  const session = await requireManager();
  const services = await getServices(false);
  const split = session.salon.tech_split_percent;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Services &amp; pricing</h1>
        <p className="text-sm text-muted-foreground">
          Prices appear at checkout, on walk-ins and when booking. Skills decide who the rotation
          can offer the work to.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Commission split</CardTitle>
          <CardDescription>
            Applies to services only — tips always go to the tech in full. Changing it never
            rewrites payments already recorded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updatePaySettings}
            resetOnSuccess={false}
            className="grid gap-4 sm:grid-cols-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="tech_split_percent">Tech share (%)</Label>
              <Input
                id="tech_split_percent"
                name="tech_split_percent"
                inputMode="decimal"
                defaultValue={String(split)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay_period_days">Pay period (days)</Label>
              <Input
                id="pay_period_days"
                name="pay_period_days"
                inputMode="numeric"
                defaultValue={String(session.salon.pay_period_days)}
                required
              />
            </div>
            <div className="flex items-end">
              <SubmitButton className="w-full">Save</SubmitButton>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              On a {formatMoney(100)} service the tech keeps {formatMoney(split)} and the salon
              keeps {formatMoney(100 - split)}.
            </p>
          </ActionForm>
        </CardContent>
      </Card>

      <ServiceManager services={services} />
    </div>
  );
}
