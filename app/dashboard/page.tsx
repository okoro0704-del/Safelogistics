import Link from "next/link";

import { CustomerDeliveryCard } from "@/components/customer/customer-delivery-card";
import { CustomerStats } from "@/components/customer/customer-stats";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import {
  getCustomerActiveDeliveries,
  getCustomerDeliveryStats,
} from "@/lib/customer/queries";
import { getSessionUser } from "@/lib/auth/session";
import { greetingForNow } from "@/lib/format";

export default async function CustomerDashboardPage() {
  const { profile } = await getSessionUser();
  const firstName = profile?.full_name.split(" ")[0] ?? "there";

  let statsError: string | null = null;
  let listError: string | null = null;
  let stats = null;
  let active = null;

  try {
    stats = await getCustomerDeliveryStats();
  } catch (error) {
    statsError =
      error instanceof Error ? error.message : "Unable to load statistics.";
  }

  try {
    active = await getCustomerActiveDeliveries(6);
  } catch (error) {
    listError =
      error instanceof Error ? error.message : "Unable to load deliveries.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greetingForNow()}, ${firstName}`}
        description="Here's an overview of your deliveries."
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/deliveries">View all deliveries</Link>
          </Button>
        }
      />

      {statsError ? (
        <ErrorState title="Could not load stats" description={statsError} />
      ) : stats ? (
        <CustomerStats stats={stats} />
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Your active deliveries</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/deliveries">My Deliveries</Link>
          </Button>
        </div>

        {listError ? (
          <ErrorState
            title="Unable to load deliveries"
            description={listError}
          />
        ) : active && active.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {active.map((delivery) => (
              <CustomerDeliveryCard key={delivery.id} delivery={delivery} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
            <h2 className="text-base font-semibold">No deliveries yet.</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Your assigned deliveries will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
