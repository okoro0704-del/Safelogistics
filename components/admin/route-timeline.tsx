import Link from "next/link";
import { Circle, CircleCheck, CircleDot } from "lucide-react";

import { StopStatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { DeliveryStop } from "@/lib/types/database";
import { cn } from "@/lib/utils";

function StopIcon({ status }: { status: DeliveryStop["status"] }) {
  if (status === "completed") {
    return <CircleCheck className="size-5 text-success" aria-hidden />;
  }
  if (status === "current") {
    return <CircleDot className="size-5 text-info" aria-hidden />;
  }
  return <Circle className="size-5 text-muted-foreground" aria-hidden />;
}

export function RouteTimeline({ stops }: { stops: DeliveryStop[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Route</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-0">
          {stops.map((stop, index) => (
            <li key={stop.id} className="relative flex gap-3 pb-6 last:pb-0">
              {index < stops.length - 1 ? (
                <span
                  className="absolute left-[9px] top-6 h-[calc(100%-12px)] w-px bg-border"
                  aria-hidden
                />
              ) : null}
              <div className="relative z-10 mt-0.5 bg-card">
                <StopIcon status={stop.status} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      "font-medium",
                      stop.status === "upcoming" && "text-muted-foreground",
                    )}
                  >
                    {stop.name}
                  </p>
                  <StopStatusBadge status={stop.status} />
                  {index === 0 ? (
                    <span className="text-xs text-muted-foreground">Origin</span>
                  ) : null}
                  {index === stops.length - 1 ? (
                    <span className="text-xs text-muted-foreground">
                      Destination
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Stop {stop.stop_order}
                  {stop.arrived_at
                    ? ` · Arrived ${formatDateTime(stop.arrived_at)}`
                    : ""}
                  {stop.completed_at
                    ? ` · Completed ${formatDateTime(stop.completed_at)}`
                    : ""}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {stop.latitude}, {stop.longitude}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function CompactDeliveryLink({
  href,
  trackingNumber,
  route,
  status,
}: {
  href: string;
  trackingNumber: string;
  route: string;
  status: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="font-mono text-sm font-medium">{trackingNumber}</p>
        <p className="truncate text-sm text-muted-foreground">{route}</p>
      </div>
      {status}
    </Link>
  );
}
