import Link from "next/link";

import { DeliveryStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { CustomerDeliveryListItem } from "@/lib/customer/queries";

export function CustomerDeliveryTable({
  deliveries,
}: {
  deliveries: CustomerDeliveryListItem[];
}) {
  if (deliveries.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Tracking</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Current</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => (
              <tr
                key={delivery.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3 font-mono text-xs font-medium md:text-sm">
                  {delivery.tracking_number}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {delivery.origin_name} → {delivery.destination_name}
                </td>
                <td className="px-4 py-3">
                  {delivery.current_stop?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <DeliveryStatusBadge status={delivery.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(delivery.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/deliveries/${delivery.id}`}>
                      View
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
