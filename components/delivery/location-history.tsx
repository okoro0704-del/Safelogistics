import { Circle, CircleCheck, CircleDot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { DeliveryLocationHistory } from "@/lib/types/database";

function eventLabel(eventType: string) {
  switch (eventType) {
    case "created":
    case "origin":
      return "Origin";
    case "departed":
      return "Departed";
    case "arrived":
    case "at_stop":
      return "Arrived";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "delayed":
      return "Delayed";
    default:
      return eventType.replaceAll("_", " ");
  }
}

function EventIcon({ eventType, isLatest }: { eventType: string; isLatest: boolean }) {
  if (eventType === "delivered") {
    return <CircleCheck className="size-4 text-success" aria-hidden />;
  }
  if (isLatest) {
    return <CircleDot className="size-4 text-info" aria-hidden />;
  }
  return <Circle className="size-4 text-muted-foreground" aria-hidden />;
}

export function LocationHistory({
  history,
}: {
  history: DeliveryLocationHistory[];
}) {
  const chronological = [...history].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Location history</CardTitle>
      </CardHeader>
      <CardContent>
        {chronological.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No movement history recorded yet.
          </p>
        ) : (
          <ol className="space-y-4">
            {chronological.map((item, index) => {
              const isLatest = index === chronological.length - 1;
              return (
                <li key={item.id} className="flex gap-3">
                  <div className="mt-0.5">
                    <EventIcon eventType={item.event_type} isLatest={isLatest} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {item.location_name}
                      {isLatest ? (
                        <span className="ml-2 text-xs font-normal text-info">
                          Latest
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {eventLabel(item.event_type)}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
