import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDeliveryStatus, formatStopStatus } from "@/lib/format";
import type { DeliveryStatus, StopStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

function deliveryVariant(status: DeliveryStatus) {
  switch (status) {
    case "delivered":
      return "success" as const;
    case "cancelled":
      return "danger" as const;
    case "delayed":
      return "warning" as const;
    case "in_transit":
    case "at_stop":
      return "info" as const;
    case "pending":
    default:
      return "secondary" as const;
  }
}

function stopVariant(status: StopStatus) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "current":
      return "info" as const;
    default:
      return "secondary" as const;
  }
}

export function DeliveryStatusBadge({
  status,
  className,
}: {
  status: DeliveryStatus;
  className?: string;
}) {
  const label = formatDeliveryStatus(status);
  return (
    <Badge
      variant={deliveryVariant(status)}
      className={cn("gap-1 uppercase tracking-wide", className)}
      aria-label={`Status: ${label}`}
    >
      {status === "delivered" ? (
        <CheckCircle2 className="size-3.5" aria-hidden />
      ) : null}
      {status === "cancelled" ? (
        <XCircle className="size-3.5" aria-hidden />
      ) : null}
      {label}
    </Badge>
  );
}

export function StopStatusBadge({ status }: { status: StopStatus }) {
  return (
    <Badge variant={stopVariant(status)}>{formatStopStatus(status)}</Badge>
  );
}
