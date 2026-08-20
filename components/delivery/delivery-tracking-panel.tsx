"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import {
  CurrentLocationCard,
  DeliveryStatusPanel,
  NextStopCard,
} from "@/components/delivery/location-cards";
import { DeliveryProgress } from "@/components/delivery/delivery-progress";
import { DeliveryTimeline } from "@/components/delivery/delivery-timeline";
import { LocationHistory } from "@/components/delivery/location-history";
import { DeliveryMapDynamic } from "@/components/delivery/delivery-map-dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchDeliveryDetailClient } from "@/lib/delivery/client-fetch";
import { buildDeliveryViewModel } from "@/lib/delivery/view-model";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
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

/**
 * Read-only live tracking for authenticated customers.
 * No proceed/edit controls — observes Admin/backend state via Realtime.
 */
export function DeliveryTrackingPanel({
  deliveryId,
  initial,
}: {
  deliveryId: string;
  initial: DetailState;
}) {
  const [state, setState] = useState<DetailState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useMemo(
    () => buildDeliveryViewModel(state.delivery, state.stops, state.history),
    [state],
  );

  const refresh = useCallback(
    async (fromRealtime = false) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      setSyncing(true);
      try {
        const sb = createClient();
        await sb.rpc("finalize_delivery_movement_if_due", {
          p_delivery_id: deliveryId,
          p_tracking_number: null,
        });
        const next = await fetchDeliveryDetailClient(deliveryId);
        if (!next) {
          setError("We couldn't find that delivery.");
          return;
        }
        setState(next);
        setError(null);
        if (fromRealtime) {
          setLiveNotice("Location updated");
          if (noticeTimer.current) clearTimeout(noticeTimer.current);
          noticeTimer.current = setTimeout(() => setLiveNotice(null), 4000);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load this delivery. Please try again.",
        );
      } finally {
        refreshInFlight.current = false;
        setSyncing(false);
      }
    },
    [deliveryId],
  );

  useEffect(() => {
    setState(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`customer-tracking:${deliveryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "pm",
          table: "deliveries",
          filter: `id=eq.${deliveryId}`,
        },
        () => {
          void refresh(true);
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
          void refresh(true);
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
          void refresh(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [deliveryId, refresh]);

  return (
    <div className="space-y-6">
      {view.isDelivered ? (
        <div
          className="rounded-xl border border-success/20 bg-success/10 px-4 py-5 text-center"
          role="status"
        >
          <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-5" aria-hidden />
          </div>
          <p className="font-semibold text-success">Delivery Completed</p>
          <p className="mt-1 text-sm text-success/90">
            Your parcel has arrived at {view.delivery.destination_name}.
          </p>
        </div>
      ) : null}

      {view.isCancelled ? (
        <div
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-5 text-center"
          role="status"
        >
          <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <XCircle className="size-5" aria-hidden />
          </div>
          <p className="font-semibold text-destructive">Delivery Cancelled</p>
          <p className="mt-1 text-sm text-destructive/80">
            This delivery is no longer active.
          </p>
        </div>
      ) : null}

      {view.delivery.status === "delayed" && !view.isTerminal ? (
        <div
          className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-4"
          role="status"
        >
          <p className="font-semibold text-warning">Delayed</p>
          <p className="mt-1 text-sm text-warning/90">
            Your delivery is currently delayed. Latest known location:{" "}
            {view.currentStop?.name ?? "Unavailable"}.
          </p>
        </div>
      ) : null}

      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <DeliveryStatusPanel
              status={view.delivery.status}
              trackingNumber={view.delivery.tracking_number}
            />
            <div className="text-right text-xs text-muted-foreground">
              <p>Last updated</p>
              <p className="font-medium text-foreground">
                {formatDateTime(view.delivery.updated_at)}
              </p>
              {liveNotice ? (
                <p className="mt-1 text-info" role="status">
                  ● {liveNotice}
                </p>
              ) : syncing ? (
                <p className="mt-1">Syncing…</p>
              ) : null}
            </div>
          </div>
          <CardDescription>
            Live tracking for your shipment. Location updates when your delivery
            company advances the parcel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <CurrentLocationCard
              name={view.currentStop?.name}
              description={
                view.isDelivered
                  ? "Your parcel has arrived at this stop."
                  : "The parcel is currently at this stop."
              }
            />
            <NextStopCard
              name={view.nextStop?.name}
              isDelivered={view.isDelivered}
              isCancelled={view.isCancelled}
              audience="customer"
            />
          </div>

          <DeliveryProgress
            stops={view.stops}
            progressPercent={view.progressPercent}
          />

          {error ? (
            <div
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <p>{error}</p>
              <button
                type="button"
                className="mt-2 font-medium underline"
                onClick={() => void refresh(false)}
              >
                Try again
              </button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <DeliveryMapDynamic
        model={view.mapModel}
        title="Where is my parcel?"
        description="Live route view. The map updates when your delivery company advances the shipment."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipment details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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
                  Weight
                </p>
                <p className="mt-1 font-medium">
                  {view.delivery.weight != null
                    ? `${view.delivery.weight} kg`
                    : "—"}
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
            </CardContent>
          </Card>

          <DeliveryTimeline stops={view.stops} />
        </div>

        <div className="space-y-6">
          <LocationHistory history={view.history} />
        </div>
      </div>
    </div>
  );
}
