"use client";

import dynamic from "next/dynamic";

import type { DeliveryMapModel } from "@/lib/delivery/view-model";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  model: DeliveryMapModel;
  title?: string;
  description?: string;
  className?: string;
};

function MapLoadingSkeleton({ title = "Route map" }: { title?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Loading map...</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-[350px] items-center justify-center rounded-xl border border-border bg-muted/50 text-sm text-muted-foreground md:h-[520px]"
          role="status"
        >
          Loading map...
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Client-only Mapbox map wrapper (SSR disabled).
 * Parent pages own data fetching / Realtime; this only renders props.
 */
const DeliveryMapClient = dynamic(
  () =>
    import("@/components/delivery/delivery-map").then((mod) => mod.DeliveryMap),
  {
    ssr: false,
    loading: () => <MapLoadingSkeleton />,
  },
);

export function DeliveryMapDynamic(props: Props) {
  return <DeliveryMapClient {...props} />;
}
