import { Phone, Search, Users } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { CustomerDialog } from "@/components/customer-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { deleteCustomer } from "@/lib/actions/customers";
import { requireSession } from "@/lib/auth";
import { formatDate, formatPhone } from "@/lib/format";
import { getCustomers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;
  const customers = await getCustomers(q);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} {customers.length === 1 ? "client" : "clients"}
            {q ? ` matching “${q}”` : ""}
          </p>
        </div>
        {session.canManageFloor ? <CustomerDialog /> : null}
      </header>

      {/* GET form: search state lives in the URL, so it survives a refresh. */}
      <form className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or phone"
          className="pl-9"
          type="search"
          aria-label="Search clients"
        />
      </form>

      {customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={q ? "No matching clients" : "No clients yet"}
            description={
              q ? "Try a different name or phone number." : "They're added automatically at check-in."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <Card key={customer.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{customer.name}</p>
                    {customer.phone ? (
                      <a
                        href={`tel:${customer.phone}`}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="size-3.5" />
                        {formatPhone(customer.phone)}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground">No phone on file</p>
                    )}
                  </div>
                  {session.canManageFloor ? (
                    <div className="flex shrink-0 items-center">
                      <CustomerDialog customer={customer} />
                      {session.isManager ? (
                      <ActionButton
                        action={deleteCustomer}
                        fields={{ id: customer.id }}
                        variant="ghost"
                        size="icon"
                        confirm={`Remove ${customer.name}? Their job history goes too.`}
                      >
                        <span aria-hidden>×</span>
                        <span className="sr-only">Delete {customer.name}</span>
                      </ActionButton>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {customer.notes ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {customer.notes}
                  </p>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Client since {formatDate(customer.created_at)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
