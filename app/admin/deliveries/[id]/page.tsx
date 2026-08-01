import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { DeliveryOperationsPanel } from "@/components/delivery/delivery-operations-panel";
import { Button } from "@/components/ui/button";
import { getDeliveryById } from "@/lib/admin/queries";

type Params = Promise<{ id: string }>;

export default async function DeliveryDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const result = await getDeliveryById(id);

  if (!result) {
    notFound();
  }

  const { delivery, stops, history } = result;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Deliveries", href: "/admin/deliveries" },
          { label: delivery.tracking_number },
        ]}
      />

      <PageHeader
        title={delivery.tracking_number}
        description="Control parcel movement one stop at a time. The database is the source of truth."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/deliveries">Back to deliveries</Link>
          </Button>
        }
      />

      <DeliveryOperationsPanel
        deliveryId={delivery.id}
        initial={{ delivery, stops, history }}
      />
    </div>
  );
}
