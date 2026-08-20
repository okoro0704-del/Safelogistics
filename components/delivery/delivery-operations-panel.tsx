"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  CurrentLocationCard,
  DeliveryStatusPanel,
  NextStopCard,
} from "@/components/delivery/location-cards";
import { DeliveryProgress } from "@/components/delivery/delivery-progress";
import { DeliveryTimeline } from "@/components/delivery/delivery-timeline";
import { LocationHistory } from "@/components/delivery/location-history";
import { DeliveryMapDynamic } from "@/components/delivery/delivery-map-dynamic";
import { ProceedControls } from "@/components/delivery/proceed-controls";
import { ScheduleMovementControls } from "@/components/delivery/schedule-movement-controls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchDeliveryDetailClient } from "@/lib/delivery/client-fetch";
import { buildDeliveryViewModel } from "@/lib/delivery/view-model";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { finalizeDeliveryMovementAction } from "@/lib/admin/actions";
import type {
  DeliveryLocationHistory,
  DeliveryStop,
  DeliveryWithRelations,
} from "@/lib/types/database";

type DetailState = {
  delivery: DeliveryWithRelations;
  stops: DeliveryStop[];
  history: DeliveryLocationHistory[];
};

export function DeliveryOperationsPanel({
  deliveryId,
  initial,
}: {
  deliveryId: string;
  initial: DetailState;
}) {
  const [state, setState] = useState<DetailState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const refreshInFlight = useRef(false);

  const view = useMemo(
    () => buildDeliveryViewModel(state.delivery, state.stops, state.history),
    [state],
  );

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setSyncing(true);
    try {
      await finalizeDeliveryMovementAction(deliveryId);
      const next = await fetchDeliveryDetailClient(deliveryId);
      if (next) {
        setState(next);
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to refresh delivery state.",
      );
    } finally {
      refreshInFlight.current = false;
      setSyncing(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    setState(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`delivery-ops:${deliveryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "pm",
          table: "deliveries",
          filter: `id=eq.${deliveryId}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "pm",
          table: "delivery_stops",
          filter: `delivery_id=eq.${deliveryId}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "pm",
          table: "delivery_location_history",
          filter: `delivery_id=eq.${deliveryId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [deliveryId, refresh]);

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="space-y-4">
          <DeliveryStatusPanel
            status={view.delivery.status}
            trackingNumber={view.delivery.tracking_number}
          />
          <CardDescription>
            Schedule timed movement so trackers see the parcel travel on the map.
            Instant jump is still available when you need to skip the transit window.
            {syncing ? " Syncing latest state…" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <CurrentLocationCard name={view.currentStop?.name} />
            <NextStopCard
              name={view.nextStop?.name}
              isDelivered={view.isDelivered}
            />
          </div>

          <DeliveryProgress
            stops={view.stops}
            progressPercent={view.progressPercent}
          />

          <ScheduleMovementControls
            deliveryId={deliveryId}
            currentStop={view.currentStop}
            nextStop={view.nextStop}
            canSchedule={view.canScheduleMovement}
            activeMovement={view.movement}
            onScheduled={refresh}
            onError={setError}
          />

          <ProceedControls
            deliveryId={deliveryId}
            trackingNumber={view.delivery.tracking_number}
            currentStop={view.currentStop}
            nextStop={view.nextStop}
            canProceed={view.canProceed}
            isDelivered={view.isDelivered}
            isCancelled={view.isCancelled}
            hasActiveMovement={view.hasActiveMovement}
            onAdvanced={refresh}
            onError={setError}
          />

          {error ? (
            <p
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Customer
                </p>
                <p className="mt-1 font-medium">
                  {view.delivery.customer ? (
                    <Link
                      href={`/admin/customers/${view.delivery.customer.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {view.delivery.customer.full_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Reference
                </p>
                <p className="mt-1 font-medium">
                  {view.delivery.reference_number || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Origin
                </p>
                <p className="mt-1 font-medium">{view.delivery.origin_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Destination
                </p>
                <p className="mt-1 font-medium">
                  {view.delivery.destination_name}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <p className="mt-1 text-sm">
                  {view.delivery.description || "No description provided."}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Created
                </p>
                <p className="mt-1 text-sm">
                  {formatDateTime(view.delivery.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Last updated
                </p>
                <p className="mt-1 text-sm">
                  {formatDateTime(view.delivery.updated_at)}
                </p>
              </div>
            </CardContent>
          </Card>

          <DeliveryTimeline stops={view.stops} />
        </div>

        <div className="space-y-6">
          <DeliveryMapDynamic
            model={view.mapModel}
            title="Route map"
            description="During a scheduled transit, trackers see a moving beacon travel between stops."
          />
          <LocationHistory history={view.history} />
        </div>
      </div>
    </div>
  );
}
