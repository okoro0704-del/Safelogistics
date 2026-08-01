import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { DeliveryTrackingPanel } from "@/components/delivery/delivery-tracking-panel";
import { Button } from "@/components/ui/button";
import { getCustomerDeliveryById } from "@/lib/customer/queries";

type Params = Promise<{ id: string }>;

export default async function CustomerDeliveryDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  let result = null;
  try {
    result = await getCustomerDeliveryById(id);
  } catch {
    // Fall through to generic not-found — do not leak existence of other customers' deliveries.
    notFound();
  }

  if (!result) {
    notFound();
  }

  const { delivery, stops, history } = result;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "My Deliveries", href: "/dashboard/deliveries" },
          { label: delivery.tracking_number },
        ]}
      />

      <PageHeader
        title={delivery.tracking_number}
        description="Live tracking for your shipment. Updates appear automatically when your delivery moves."
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/deliveries">Back to deliveries</Link>
          </Button>
        }
      />

      <DeliveryTrackingPanel
        deliveryId={delivery.id}
        initial={{ delivery, stops, history }}
      />
    </div>
  );
}
