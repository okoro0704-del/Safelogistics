import Link from "next/link";
import { MapPinned } from "lucide-react";

import { DeliveryStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { calculateRouteProgress } from "@/lib/delivery/view-model";
import type { CustomerDeliveryListItem } from "@/lib/customer/queries";
import type { DeliveryStop } from "@/lib/types/database";

export function CustomerDeliveryCard({
  delivery,
}: {
  delivery: CustomerDeliveryListItem;
}) {
  const stops = delivery.stops.map(
    (stop) =>
      ({
        ...stop,
        delivery_id: delivery.id,
        latitude: 0,
        longitude: 0,
        arrived_at: null,
        completed_at: null,
        created_at: delivery.created_at,
        updated_at: delivery.updated_at,
      }) satisfies DeliveryStop,
  );

  const currentStop =
    stops.find((stop) => stop.status === "current") ??
    stops.find((stop) => stop.id === delivery.current_stop_id) ??
    null;

  const progressPercent = calculateRouteProgress(
    stops,
    delivery.status,
    currentStop,
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardDescription>Tracking number</CardDescription>
            <CardTitle className="font-mono text-lg">
              {delivery.tracking_number}
            </CardTitle>
          </div>
          <DeliveryStatusBadge status={delivery.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {delivery.origin_name} → {delivery.destination_name}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Current location
          </p>
          <p className="mt-1 inline-flex items-center gap-2 font-medium">
            <MapPinned className="size-4 text-primary" aria-hidden />
            {delivery.current_stop?.name ?? "Not available"}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Route progress</span>
            <span className="font-semibold text-foreground">
              {progressPercent}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <Button asChild className="w-full sm:w-auto">
          <Link href={`/dashboard/deliveries/${delivery.id}`}>
            Track Delivery
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
