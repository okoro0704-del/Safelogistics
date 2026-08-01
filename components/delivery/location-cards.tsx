import { MapPinned } from "lucide-react";

import { DeliveryStatusBadge } from "@/components/admin/status-badge";
import { TrackingNumberDisplay } from "@/components/common/copy-tracking";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DeliveryStatus } from "@/lib/types/database";

export function DeliveryStatusPanel({
  status,
  trackingNumber,
}: {
  status: DeliveryStatus;
  trackingNumber: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tracking number
        </p>
        <TrackingNumberDisplay trackingNumber={trackingNumber} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <DeliveryStatusBadge status={status} />
      </div>
    </div>
  );
}

export function CurrentLocationCard({
  name,
  emptyLabel = "Not available",
  description,
}: {
  name: string | null | undefined;
  emptyLabel?: string;
  description?: string;
}) {
  return (
    <Card className="border-primary/15">
      <CardHeader className="pb-2">
        <CardDescription>Current location</CardDescription>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MapPinned className="size-5 text-primary" aria-hidden />
          {name || emptyLabel}
        </CardTitle>
      </CardHeader>
      {description ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function NextStopCard({
  name,
  isDelivered,
  isCancelled = false,
  audience = "admin",
}: {
  name: string | null | undefined;
  isDelivered: boolean;
  isCancelled?: boolean;
  audience?: "admin" | "customer";
}) {
  let title = "Final stop — ready to complete";
  let helper = "Confirm to mark this delivery as delivered.";

  if (isCancelled) {
    title = "No further stops";
    helper = "This delivery is no longer active.";
  } else if (isDelivered) {
    title = "Destination reached";
    helper =
      audience === "customer"
        ? "Your parcel has arrived at its destination."
        : "This delivery has reached its destination.";
  } else if (name) {
    title = name;
    helper =
      audience === "customer"
        ? "Awaiting departure from the current stop."
        : "The parcel advances only when you confirm Proceed.";
  } else if (audience === "customer") {
    title = "Awaiting final confirmation";
    helper = "Your delivery company will complete this shipment shortly.";
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>Next stop</CardDescription>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MapPinned className="size-5 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}
