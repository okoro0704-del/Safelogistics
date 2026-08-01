import Link from "next/link";
import { Plus } from "lucide-react";

import { DashboardStatsCards } from "@/components/admin/dashboard-stats";
import {
  DeliveryEmptyWithLink,
  DeliveryTable,
} from "@/components/admin/delivery-table";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { getDashboardStats, getRecentDeliveries } from "@/lib/admin/queries";
import { getSessionUser } from "@/lib/auth/session";
import { greetingForNow } from "@/lib/format";

export default async function AdminDashboardPage() {
  const { profile } = await getSessionUser();

  let statsError: string | null = null;
  let deliveriesError: string | null = null;
  let stats = null;
  let recent = null;

  try {
    stats = await getDashboardStats();
  } catch (error) {
    statsError =
      error instanceof Error ? error.message : "Unable to load statistics.";
  }

  try {
    recent = await getRecentDeliveries(8);
  } catch (error) {
    deliveriesError =
      error instanceof Error ? error.message : "Unable to load deliveries.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greetingForNow()}, ${profile?.full_name.split(" ")[0] ?? "Admin"}`}
        description="Here's what's happening with your deliveries."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/customers/new">New customer</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/deliveries/new">
                <Plus className="size-4" aria-hidden />
                Create delivery
              </Link>
            </Button>
          </>
        }
      />

      {statsError ? (
        <ErrorState title="Could not load stats" description={statsError} />
      ) : stats ? (
        <DashboardStatsCards stats={stats} />
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent deliveries</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/deliveries">View all</Link>
          </Button>
        </div>

        {deliveriesError ? (
          <ErrorState
            title="Could not load deliveries"
            description={deliveriesError}
          />
        ) : recent && recent.length > 0 ? (
          <DeliveryTable deliveries={recent} />
        ) : (
          <DeliveryEmptyWithLink
            title="No deliveries yet."
            description="Create your first delivery to start tracking parcels."
            href="/admin/deliveries/new"
            label="Create Delivery"
          />
        )}
      </section>
    </div>
  );
}
