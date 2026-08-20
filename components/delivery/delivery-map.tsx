"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildMapStopPoints,
  lineStringFeature,
  splitRouteCoordinates,
  type MapLngLat,
  type MapStopPoint,
} from "@/lib/delivery/map-geometry";
import { loadMapboxGL } from "@/lib/delivery/mapbox-loader";
import type {
  MapboxGL,
  MapboxMap,
  MapboxMarker,
  MapboxPopup,
} from "@/lib/delivery/mapbox-types";
import type { DeliveryMapModel } from "@/lib/delivery/view-model";
import {
  interpolateLngLat,
  transitProgress,
} from "@/lib/delivery/view-model";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const COMPLETED_SOURCE = "delivery-route-completed";
const REMAINING_SOURCE = "delivery-route-remaining";
const COMPLETED_LAYER = "delivery-route-completed-line";
const REMAINING_LAYER = "delivery-route-remaining-line";
/** Clean logistics-friendly style; replaceable later via white-label config. */
const MAP_STYLE = "mapbox://styles/mapbox/light-v11";

type DeliveryMapProps = {
  model: DeliveryMapModel;
  title?: string;
  description?: string;
  className?: string;
};

function getAccessToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || !token.trim()) return null;
  return token.trim();
}

function markerSymbol(point: MapStopPoint): string {
  if (point.status === "completed") return "✓";
  if (point.status === "current") return "●";
  if (point.isDestination) return "◎";
  return "○";
}

function statusLabel(point: MapStopPoint): string {
  if (point.status === "current") return "Current Location";
  if (point.status === "completed") return "Completed";
  if (point.isDestination) return "Destination";
  return "Upcoming Stop";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildPopupHtml(point: MapStopPoint): string {
  const lines = [
    `<strong style="display:block;font-size:13px;margin-bottom:4px">${escapeHtml(point.name)}</strong>`,
    `<span style="display:block;font-size:12px;color:#64748b">${escapeHtml(statusLabel(point))}</span>`,
  ];
  if (point.arrivedAt) {
    lines.push(
      `<span style="display:block;font-size:12px;margin-top:6px;color:#475569">Arrived: ${escapeHtml(formatDateTime(point.arrivedAt))}</span>`,
    );
  }
  return `<div style="padding:2px 0;min-width:120px">${lines.join("")}</div>`;
}

function createMarkerElement(point: MapStopPoint): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "delivery-map-marker";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", `${point.name}, ${statusLabel(point)}`);
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-4px)";

  const isCurrent = point.status === "current";
  const isCompleted = point.status === "completed";
  const isDest = point.isDestination && !isCurrent;

  if (isCurrent) {
    const label = document.createElement("div");
    label.textContent = "Current";
    label.style.cssText =
      "background:#0f766e;color:#fff;font-size:10px;font-weight:600;letter-spacing:0.02em;padding:3px 8px;border-radius:6px;margin-bottom:4px;box-shadow:0 1px 4px rgba(15,23,42,0.2);white-space:nowrap";
    el.appendChild(label);

    const name = document.createElement("div");
    name.textContent = point.name;
    name.style.cssText =
      "background:#fff;color:#0f172a;font-size:11px;font-weight:600;padding:4px 8px;border-radius:6px;border:1px solid #ccfbf1;margin-bottom:4px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 1px 4px rgba(15,23,42,0.12)";
    el.appendChild(name);
  }

  const dot = document.createElement("div");
  dot.textContent = markerSymbol(point);
  const size = isCurrent ? 28 : isDest ? 26 : 22;
  const bg = isCurrent
    ? "#0f766e"
    : isCompleted
      ? "#15803d"
      : isDest
        ? "#1e3a5f"
        : "#fff";
  const color = isCurrent || isCompleted || isDest ? "#fff" : "#64748b";
  const border = isCurrent
    ? "3px solid #99f6e4"
    : isDest
      ? "2px solid #94a3b8"
      : "2px solid #cbd5e1";

  dot.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:${color};border:${border};display:flex;align-items:center;justify-content:center;font-size:${isCurrent ? 12 : 11}px;font-weight:700;line-height:1;box-shadow:0 2px 6px rgba(15,23,42,0.18)`;
  el.appendChild(dot);
  return el;
}

function setOrUpdateLineSource(
  map: MapboxMap,
  sourceId: string,
  layerId: string,
  coordinates: MapLngLat[],
  style: {
    color: string;
    width: number;
    opacity: number;
    dasharray?: number[];
  },
) {
  const data = {
    type: "FeatureCollection" as const,
    features: [lineStringFeature(coordinates)],
  };

  const existing = map.getSource(sourceId);
  if (existing) {
    existing.setData(data);
    return;
  }

  map.addSource(sourceId, { type: "geojson", data });
  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": style.color,
      "line-width": style.width,
      "line-opacity": style.opacity,
      ...(style.dasharray ? { "line-dasharray": style.dasharray } : {}),
    },
  });
}

function fitToPoints(
  mapboxgl: MapboxGL,
  map: MapboxMap,
  points: MapStopPoint[],
) {
  if (points.length === 0) return;

  if (points.length === 1) {
    map.easeTo({
      center: points[0].lngLat,
      zoom: 11,
      duration: 400,
      padding: 48,
    });
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  for (const point of points) {
    bounds.extend(point.lngLat);
  }

  map.fitBounds(bounds, {
    padding: { top: 72, bottom: 48, left: 48, right: 48 },
    maxZoom: 12,
    duration: 500,
  });
}

function MapUnavailable({ reason }: { reason: "token" | "error" | "coords" }) {
  const copy =
    reason === "token"
      ? {
          title: "Map unavailable",
          body: "Route details and current location are still available below.",
        }
      : reason === "coords"
        ? {
            title: "Map unavailable",
            body: "Route details and current location are still available below.",
          }
        : {
            title: "Unable to load map",
            body: "Route details and current location are still available below.",
          };

  return (
    <div
      className="flex h-[350px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-6 text-center md:h-[520px]"
      role="status"
    >
      <p className="font-medium text-foreground">{copy.title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{copy.body}</p>
    </div>
  );
}

function MapLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-primary">●</span> Current
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-success">✓</span> Completed
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">○</span> Upcoming
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-foreground">◎</span> Destination
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 bg-success" aria-hidden />{" "}
        Completed route
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-0 w-4 border-t-2 border-dashed border-primary/70"
          aria-hidden
        />{" "}
        Remaining route
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          className="inline-block size-2.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(15,118,110,0.25)]"
          aria-hidden
        />{" "}
        Moving parcel
      </li>
    </ul>
  );
}

function createTransitBeaconElement(fromName: string, toName: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "delivery-transit-beacon";
  el.setAttribute("role", "status");
  el.setAttribute(
    "aria-label",
    `Parcel in transit from ${fromName} to ${toName}`,
  );
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateY(-6px)";

  const pulse = document.createElement("div");
  pulse.className = "delivery-transit-beacon__pulse";
  el.appendChild(pulse);

  const core = document.createElement("div");
  core.className = "delivery-transit-beacon__core";
  core.textContent = "●";
  el.appendChild(core);

  const label = document.createElement("div");
  label.className = "delivery-transit-beacon__label";
  label.textContent = "In transit";
  el.appendChild(label);

  return el;
}

/**
 * Presentation-only Mapbox map. Receives delivery state via props.
 * Does not fetch data, subscribe to Realtime, or mutate delivery state.
 */
export function DeliveryMap({
  model,
  title = "Route map",
  description = "Visualizes the delivery route. During timed movement, a beacon travels between stops.",
  className,
}: DeliveryMapProps) {
  const token = getAccessToken();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapboxRef = useRef<MapboxGL | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const transitMarkerRef = useRef<MapboxMarker | null>(null);
  const transitRafRef = useRef<number | null>(null);
  const popupRef = useRef<MapboxPopup | null>(null);
  const userInteractedRef = useRef(false);
  const fittedRouteKeyRef = useRef<string | null>(null);
  const lastCurrentIdRef = useRef<string | null>(null);
  const pointsRef = useRef<MapStopPoint[]>([]);
  const routeKeyRef = useRef("");
  const currentIdRef = useRef<string | null>(null);
  const transitRef = useRef(model.transit);
  const [loading, setLoading] = useState(Boolean(token));
  const [initError, setInitError] = useState(false);
  const reactId = useId();

  const { points, skippedCount } = useMemo(
    () => buildMapStopPoints(model),
    [model],
  );
  const routeKey = useMemo(
    () => points.map((p) => `${p.id}:${p.lngLat[0]},${p.lngLat[1]}`).join("|"),
    [points],
  );
  const currentId =
    model.currentStop?.id ??
    points.find((p) => p.status === "current")?.id ??
    null;
  const transitKey = model.transit
    ? `${model.transit.startedAt}|${model.transit.durationMinutes}|${model.transit.fromLngLat.join(",")}|${model.transit.toLngLat.join(",")}`
    : "none";

  pointsRef.current = points;
  routeKeyRef.current = routeKey;
  currentIdRef.current = currentId;
  transitRef.current = model.transit;

  function clearMarkers() {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    popupRef.current?.remove();
    popupRef.current = null;
  }

  function clearTransitMarker() {
    if (transitRafRef.current != null) {
      cancelAnimationFrame(transitRafRef.current);
      transitRafRef.current = null;
    }
    transitMarkerRef.current?.remove();
    transitMarkerRef.current = null;
  }

  function updateTransitBeacon() {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    const transit = transitRef.current;
    if (!map || !mapboxgl) return;

    if (!transit) {
      clearTransitMarker();
      return;
    }

    const progress = transitProgress(
      transit.startedAt,
      transit.durationMinutes,
    );
    const lngLat = interpolateLngLat(
      transit.fromLngLat,
      transit.toLngLat,
      progress,
    );

    if (!transitMarkerRef.current) {
      const el = createTransitBeaconElement(transit.fromName, transit.toName);
      transitMarkerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      transitMarkerRef.current.setLngLat(lngLat);
    }

    if (progress < 1) {
      transitRafRef.current = requestAnimationFrame(() => {
        updateTransitBeacon();
      });
    }
  }

  function updateMapVisuals() {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    const nextPoints = pointsRef.current;
    if (!map || !mapboxgl || nextPoints.length === 0) return;

    const { completed, remaining } = splitRouteCoordinates(nextPoints);

    setOrUpdateLineSource(map, COMPLETED_SOURCE, COMPLETED_LAYER, completed, {
      color: "#15803d",
      width: 4,
      opacity: 0.9,
    });

    setOrUpdateLineSource(map, REMAINING_SOURCE, REMAINING_LAYER, remaining, {
      color: "#0f766e",
      width: 3.5,
      opacity: 0.55,
      dasharray: [1.5, 1.5],
    });

    clearMarkers();

    for (const point of nextPoints) {
      const el = createMarkerElement(point);
      const popup = new mapboxgl.Popup({
        offset: point.status === "current" ? 36 : 18,
        closeButton: true,
        maxWidth: "240px",
      }).setHTML(buildPopupHtml(point));

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat(point.lngLat)
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    }

    const nextRouteKey = routeKeyRef.current;
    const nextCurrentId = currentIdRef.current;

    if (fittedRouteKeyRef.current !== nextRouteKey) {
      fittedRouteKeyRef.current = nextRouteKey;
      userInteractedRef.current = false;
      fitToPoints(mapboxgl, map, nextPoints);
      lastCurrentIdRef.current = nextCurrentId;
    } else if (
      nextCurrentId &&
      nextCurrentId !== lastCurrentIdRef.current &&
      !userInteractedRef.current
    ) {
      const current = nextPoints.find((p) => p.id === nextCurrentId);
      if (current) {
        map.easeTo({
          center: current.lngLat,
          duration: 600,
          padding: 48,
        });
      }
      lastCurrentIdRef.current = nextCurrentId;
    } else {
      lastCurrentIdRef.current = nextCurrentId;
    }

    clearTransitMarker();
    updateTransitBeacon();
  }

  // Initialize Mapbox once
  useEffect(() => {
    if (!token || !containerRef.current || points.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setInitError(false);

    void (async () => {
      try {
        const mapboxgl = await loadMapboxGL();
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = token;
        mapboxRef.current = mapboxgl;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: pointsRef.current[0]?.lngLat ?? [3.3792, 6.5244],
          zoom: 5,
          attributionControl: true,
        });

        map.addControl(
          new mapboxgl.NavigationControl({ showCompass: false }),
          "top-right",
        );
        map.addControl(new mapboxgl.FullscreenControl(), "top-right");

        map.on("dragstart", () => {
          userInteractedRef.current = true;
        });
        map.on("zoomstart", (e) => {
          if (e?.originalEvent) userInteractedRef.current = true;
        });

        map.on("load", () => {
          if (cancelled) return;
          mapRef.current = map;
          setLoading(false);
          updateMapVisuals();
          map.resize();
        });

        mapRef.current = map;
      } catch {
        if (!cancelled) {
          clearTransitMarker();
          clearMarkers();
          mapRef.current?.remove();
          mapRef.current = null;
          mapboxRef.current = null;
          setInitError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTransitMarker();
      clearMarkers();
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
      fittedRouteKeyRef.current = null;
      lastCurrentIdRef.current = null;
      userInteractedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, points.length === 0]);

  // React to delivery state changes without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token || points.length === 0) return;

    if (map.isStyleLoaded()) {
      updateMapVisuals();
    } else {
      map.once("load", () => updateMapVisuals());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, currentId, skippedCount, transitKey, token]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <MapLegend />
      </CardHeader>
      <CardContent className="space-y-3">
        {!token ? (
          <MapUnavailable reason="token" />
        ) : points.length === 0 ? (
          <MapUnavailable reason="coords" />
        ) : (
          <div className="relative">
            {initError ? (
              <MapUnavailable reason="error" />
            ) : (
              <>
                {loading ? (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-muted/80 text-sm text-muted-foreground"
                    role="status"
                  >
                    Loading map...
                  </div>
                ) : null}
                <div
                  ref={containerRef}
                  id={`delivery-map-${reactId.replace(/:/g, "")}`}
                  className="h-[350px] w-full overflow-hidden rounded-xl border border-border md:h-[520px]"
                  aria-label={`Map for route from ${model.origin.name} to ${model.destination.name}`}
                />
              </>
            )}
          </div>
        )}

        {model.transit ? (
          <p className="text-xs text-muted-foreground" role="status">
            In transit: {model.transit.fromName} → {model.transit.toName} (
            {model.transit.durationMinutes} min window)
          </p>
        ) : null}

        {skippedCount > 0 ? (
          <p className="text-xs text-muted-foreground" role="status">
            Some route stops do not have map coordinates.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
