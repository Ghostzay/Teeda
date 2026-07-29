import { ActionForm } from "@/components/action-form";
import { ServiceManager } from "@/components/service-manager";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePaySettings } from "@/lib/actions/services";
import { requireManager } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { getServiceMenu } from "@/lib/queries";
import { ALL_SERVICE_CATEGORIES, SERVICE_CATEGORY_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Services & pricing — the salon's menu, plus how the take is split. */
export default async function ServicesPage() {
  const session = await requireManager();
  // Inactive included: this is the one screen where a hidden item still has to
  // be findable, otherwise turning something back on means re-creating it.
  const services = await getServiceMenu(true);
  const split = session.salon.tech_split_percent;

  const live = services.filter((item) => item.is_active);
  const empty = ALL_SERVICE_CATEGORIES.filter(
    (category) => !live.some((item) => item.category === category),
  );

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-display font-semibold tracking-tight">Services &amp; prices</h1>
        <p className="text-sm text-secondary-text">
          Prices appear at checkout, on walk-ins and when booking. The category a service sits in
          decides which skill it needs, so the rotation only offers it to techs who can do it.
        </p>
      </header>

      {empty.length > 0 && live.length > 0 ? (
        <p className="rounded-xl border border-warning-border bg-warning-bg px-4 py-2.5 text-sm text-warning">
          Nothing on the menu under {empty.map((c) => SERVICE_CATEGORY_LABEL[c]).join(", ")} — those
          tabs will be empty when the desk books someone in.
        </p>
      ) : null}

      <ServiceManager services={services} />

      <section aria-label="Commission split" className="space-y-3">
        <div>
          <h2 className="text-title">Commission split</h2>
          <p className="text-sm text-secondary-text">
            Applies to services only — tips always go to the tech in full. Changing it never
            rewrites payments already recorded.
          </p>
        </div>

        <ActionForm
          action={updatePaySettings}
          resetOnSuccess={false}
          className="grid gap-4 rounded-2xl border border-subtle bg-surface-raised p-4 sm:grid-cols-3"
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
          <p className="text-meta text-muted-text sm:col-span-3">
            On a {formatMoney(100)} service the tech keeps {formatMoney(split)} and the salon keeps{" "}
            {formatMoney(100 - split)}.
          </p>
        </ActionForm>
      </section>
    </div>
  );
}
