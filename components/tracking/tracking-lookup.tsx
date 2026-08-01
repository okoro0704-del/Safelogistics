"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Circle, CircleCheck, CircleDot, MapPinned } from "lucide-react";

import { BrandTheme } from "@/components/branding/brand-theme";
import { BrandMark } from "@/components/layout/brand-mark";
import { DeliveryStatusBadge } from "@/components/admin/status-badge";
import { TrackingNumberDisplay } from "@/components/common/copy-tracking";
import { DeliveryMapDynamic } from "@/components/delivery/delivery-map-dynamic";
import { TrackingForm } from "@/components/tracking/tracking-form";
import { Spinner } from "@/components/common/loading";
import { ErrorState, NotFoundState } from "@/components/common/states";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveBrand } from "@/lib/branding";
import {
  publicTrackingHasMapCoordinates,
  publicTrackingToMapModel,
} from "@/lib/delivery/map-geometry";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { fetchPublicTracking } from "@/lib/tracking/public";
import type { PublicTrackingResult } from "@/lib/types/database";
import { isValidTrackingNumber, normalizeTrackingNumber } from "@/lib/utils";

function publicProgress(result: Extract<PublicTrackingResult, { found: true }>) {
  const completed = result.completed_stops?.length ?? 0;
  const upcoming = result.upcoming_stops?.length ?? 0;
  const hasCurrent = result.current_stop ? 1 : 0;
  const total = completed + upcoming + hasCurrent;
  if (result.status === "delivered") return 100;
  if (total <= 1) return hasCurrent ? 100 : 0;
  const currentOrder = result.current_stop?.stop_order ?? completed + 1;
  return Math.max(
    0,
    Math.min(100, Math.round(((currentOrder - 1) / (total - 1)) * 100)),
  );
}

function nextStopName(
  result: Extract<PublicTrackingResult, { found: true }>,
): string | null {
  if (result.status === "delivered") return null;
  return result.upcoming_stops?.[0]?.name ?? result.destination.name;
}

export function TrackingLookup({
  number,
  initialBrandName,
}: {
  number?: string;
  /** Display hint only — tenant scope is enforced server-side via Host. */
  initialBrandName?: string | null;
}) {
  const [result, setResult] = useState<PublicTrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (trackingNumber: string) => {
    const data = await fetchPublicTracking(trackingNumber);
    setResult(data);
  }, []);

  useEffect(() => {
    if (!number) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    const normalized = normalizeTrackingNumber(number);
    if (!isValidTrackingNumber(normalized)) {
      setResult(null);
      setError("Invalid tracking number format.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    load(normalized)
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult(null);
          setError(
            err instanceof Error ? err.message : "Unable to look up delivery.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    const interval = window.setInterval(() => {
      void load(normalized).catch(() => {
        // Keep showing last good result on transient poll failures.
      });
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [number, load]);

  const found = result && result.found ? result : null;
  const progress = useMemo(
    () => (found ? publicProgress(found) : 0),
    [found],
  );
  const publicMapModel = useMemo(() => {
    if (!found || !publicTrackingHasMapCoordinates(found)) return null;
    return publicTrackingToMapModel(found);
  }, [found]);
  const nextName = found ? nextStopName(found) : null;
  const brand = useMemo(() => {
    if (!found?.branding) {
      return resolveBrand({
        companyName: initialBrandName,
      });
    }
    return resolveBrand({
      companyName: found.branding.company_name,
      companySlug: found.branding.company_slug,
      branding: found.branding,
    });
  }, [found, initialBrandName]);

  useEffect(() => {
    if (!found) return;
    document.title = `${brand.displayName} — Track Delivery`;
    if (brand.faviconUrl || brand.logoUrl) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = brand.faviconUrl || brand.logoUrl || link.href;
    }
  }, [found, brand]);

  const content = (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {found?.branding ? (
        <div className="flex items-center justify-between gap-3">
          <BrandMark href="/track" brand={brand} />
          {brand.supportEmail ? (
            <a
              href={`mailto:${brand.supportEmail}`}
              className="text-sm text-primary hover:underline"
            >
              Support
            </a>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Track a delivery</CardTitle>
          <CardDescription>
            {found?.branding
              ? brand.tagline
              : "Enter a tracking number to view public shipment status. No account required."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrackingForm initialValue={number ?? ""} />
        </CardContent>
      </Card>

      {loading ? <Spinner label="Fetching tracking details…" /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load tracking"
          description={error}
          onAction={() => window.location.reload()}
        />
      ) : null}

      {!loading && !error && result && !result.found ? (
        <NotFoundState
          title="Delivery Not Found"
          description="We couldn't find a delivery with that tracking number. Please check the tracking number and try again."
        />
      ) : null}

      {!loading && !error && found ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="space-y-4">
              <div className="space-y-1">
                <CardDescription>Tracking number</CardDescription>
                <TrackingNumberDisplay
                  trackingNumber={found.tracking_number}
                />
              </div>
              <DeliveryStatusBadge status={found.status} />
            </CardHeader>
            <CardContent className="space-y-4">
              {found.status === "delivered" ? (
                <div
                  className="rounded-xl border border-success/20 bg-success/10 px-4 py-4 text-center"
                  role="status"
                >
                  <p className="font-semibold text-success">✓ Delivered</p>
                  <p className="mt-1 text-sm text-success/90">
                    This delivery has reached its destination.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-primary/20 bg-accent/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Current location
                  </p>
                  <p className="mt-1 inline-flex items-center gap-2 text-lg font-semibold">
                    <MapPinned className="size-4 text-primary" aria-hidden />
                    {found.current_stop?.name ??
                      found.current_location?.name ??
                      "Not available"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Next stop
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {found.status === "delivered"
                      ? "Destination reached"
                      : (nextName ?? "—")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span className="font-semibold text-foreground">
                    {progress}%
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(found.last_updated)} ·{" "}
                {formatDateTime(found.last_updated)}
              </p>
            </CardContent>
          </Card>

          {publicMapModel ? (
            <DeliveryMapDynamic
              model={publicMapModel}
              title="Map"
              description="Public route view for this tracking number."
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Route</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(found.completed_stops ?? []).map((stop) => (
                <div
                  key={`c-${stop.stop_order}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <CircleCheck className="size-4 text-success" aria-hidden />
                  <span>{stop.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Completed
                  </span>
                </div>
              ))}
              {found.current_stop ? (
                <div className="flex items-center gap-2 rounded-md bg-accent/50 px-2 py-1.5 text-sm">
                  <CircleDot className="size-4 text-info" aria-hidden />
                  <span className="font-medium">{found.current_stop.name}</span>
                  <span className="text-xs text-muted-foreground">Current</span>
                </div>
              ) : null}
              {(found.upcoming_stops ?? []).map((stop) => (
                <div
                  key={`u-${stop.stop_order}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Circle className="size-4" aria-hidden />
                  <span>{stop.name}</span>
                  <span className="text-xs">Upcoming</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {found.timeline?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {found.timeline.map((item, index) => (
                  <div key={`${item.created_at}-${index}`} className="text-sm">
                    <p className="font-medium">{item.location_name}</p>
                    <p className="text-muted-foreground">
                      {item.event_type.replaceAll("_", " ")} ·{" "}
                      {formatDateTime(item.created_at)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (found?.branding) {
    return <BrandTheme brand={brand}>{content}</BrandTheme>;
  }

  return content;
}
