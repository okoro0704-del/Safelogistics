import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { DeliveryStatusBadge } from "@/components/admin/status-badge";
import { PageHeader } from "@/components/admin/page-header";
import { CompactDeliveryLink } from "@/components/admin/route-timeline";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCustomerById } from "@/lib/admin/queries";
import { formatDate } from "@/lib/format";

type Params = Promise<{ id: string }>;

export default async function CustomerDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const result = await getCustomerById(id);

  if (!result) {
    notFound();
  }

  const { customer, deliveries } = result;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Customers", href: "/admin/customers" },
          { label: customer.full_name },
        ]}
      />

      <PageHeader
        title={customer.full_name}
        description="Customer profile and assigned deliveries."
        actions={
          <Button asChild>
            <Link href={`/admin/deliveries/new`}>Create delivery</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Company-scoped customer account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Email
              </p>
              <p className="mt-1 font-medium">{customer.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Phone
              </p>
              <p className="mt-1 font-medium">{customer.phone || "Not provided"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Deliveries
              </p>
              <p className="mt-1 font-medium tabular-nums">{deliveries.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Created
              </p>
              <p className="mt-1 font-medium">{formatDate(customer.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deliveries</CardTitle>
            <CardDescription>Shipments assigned to this customer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deliveries yet for this customer.
              </p>
            ) : (
              deliveries.map((delivery) => (
                <CompactDeliveryLink
                  key={delivery.id}
                  href={`/admin/deliveries/${delivery.id}`}
                  trackingNumber={delivery.tracking_number}
                  route={`${delivery.origin_name} → ${delivery.destination_name}`}
                  status={<DeliveryStatusBadge status={delivery.status} />}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
