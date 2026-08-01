import type { DeliveryMapModel } from "@/lib/delivery/view-model";
import type {
  DeliveryStop,
  PublicTrackingResult,
  StopStatus,
} from "@/lib/types/database";

export type MapLngLat = [number, number];

export type MapStopPoint = {
  id: string;
  name: string;
  stopOrder: number;
  status: StopStatus;
  lngLat: MapLngLat;
  arrivedAt: string | null;
  completedAt: string | null;
  isDestination: boolean;
  isOrigin: boolean;
};

export function isValidCoordinate(
  latitude: unknown,
  longitude: unknown,
): latitude is number {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return false;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

export function toLngLat(
  latitude: number,
  longitude: number,
): MapLngLat | null {
  if (!isValidCoordinate(latitude, longitude)) return null;
  return [longitude, latitude];
}

/**
 * Build mappable stop points from delivery stops (ordered).
 * Stops without valid coordinates are omitted from the map.
 */
export function buildMapStopPoints(model: DeliveryMapModel): {
  points: MapStopPoint[];
  skippedCount: number;
} {
  const ordered = [...model.stops].sort((a, b) => a.stop_order - b.stop_order);
  const lastOrder = ordered[ordered.length - 1]?.stop_order;
  const firstOrder = ordered[0]?.stop_order;
  const points: MapStopPoint[] = [];
  let skippedCount = 0;

  for (const stop of ordered) {
    const lngLat = toLngLat(stop.latitude, stop.longitude);
    if (!lngLat) {
      skippedCount += 1;
      continue;
    }

    let status: StopStatus = stop.status;
    if (model.currentStop?.id === stop.id) {
      status = "current";
    } else if (
      model.completedStops.some((s) => s.id === stop.id) ||
      stop.status === "completed"
    ) {
      status = "completed";
    } else if (stop.status === "upcoming") {
      status = "upcoming";
    }

    points.push({
      id: stop.id,
      name: stop.name,
      stopOrder: stop.stop_order,
      status,
      lngLat,
      arrivedAt: stop.arrived_at,
      completedAt: stop.completed_at,
      isDestination: stop.stop_order === lastOrder,
      isOrigin: stop.stop_order === firstOrder,
    });
  }

  return { points, skippedCount };
}

/**
 * Split mapped points into completed vs remaining line coordinates.
 * Current stop index `i` in mapped points: completed [0..i], remaining [i..n].
 */
export function splitRouteCoordinates(points: MapStopPoint[]): {
  completed: MapLngLat[];
  remaining: MapLngLat[];
  currentIndex: number;
} {
  if (points.length === 0) {
    return { completed: [], remaining: [], currentIndex: -1 };
  }

  let currentIndex = points.findIndex((p) => p.status === "current");
  if (currentIndex < 0) {
    // Delivered: treat last completed / last stop as current for route paint
    const lastCompleted = [...points]
      .reverse()
      .findIndex((p) => p.status === "completed");
    if (lastCompleted >= 0) {
      currentIndex = points.length - 1 - lastCompleted;
    } else {
      currentIndex = 0;
    }
  }

  const completed =
    currentIndex <= 0
      ? points.length === 1
        ? [points[0].lngLat]
        : []
      : points.slice(0, currentIndex + 1).map((p) => p.lngLat);

  // For first stop with no prior travel, completed may be empty — OK
  // When current is first and there's a prior completed status on same point only:
  if (currentIndex === 0 && points[0].status === "current") {
    // no completed segment between distinct stops
  }

  const remaining = points.slice(currentIndex).map((p) => p.lngLat);

  return { completed, remaining, currentIndex };
}

export function lineStringFeature(coordinates: MapLngLat[]) {
  if (coordinates.length < 2) {
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: [] as MapLngLat[],
      },
    };
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates,
    },
  };
}

/**
 * Convert public tracking payload into DeliveryMapModel when safe coords exist.
 * Uses only fields already returned by get_public_tracking (no private data).
 */
export function publicTrackingToMapModel(
  result: Extract<PublicTrackingResult, { found: true }>,
): DeliveryMapModel | null {
  const stops: DeliveryStop[] = [];
  const now = new Date().toISOString();

  const pushStop = (
    name: string,
    stopOrder: number,
    status: StopStatus,
    latitude?: number | null,
    longitude?: number | null,
    arrivedAt?: string | null,
    completedAt?: string | null,
    idSuffix?: string,
  ) => {
    if (!isValidCoordinate(latitude ?? NaN, longitude ?? NaN)) return;
    stops.push({
      id: `public-${idSuffix ?? stopOrder}`,
      delivery_id: "public",
      name,
      latitude: latitude as number,
      longitude: longitude as number,
      stop_order: stopOrder,
      status,
      arrived_at: arrivedAt ?? null,
      completed_at: completedAt ?? null,
      created_at: now,
      updated_at: now,
    });
  };

  for (const stop of result.completed_stops) {
    pushStop(
      stop.name,
      stop.stop_order,
      "completed",
      stop.latitude,
      stop.longitude,
      stop.arrived_at,
      stop.completed_at,
      `c-${stop.stop_order}`,
    );
  }

  if (result.current_stop || result.current_location) {
    const cur = result.current_stop ?? result.current_location!;
    const lat =
      cur.latitude ??
      result.current_location?.latitude ??
      result.current_stop?.latitude;
    const lng =
      cur.longitude ??
      result.current_location?.longitude ??
      result.current_stop?.longitude;
    pushStop(
      cur.name,
      cur.stop_order,
      "current",
      lat,
      lng,
      result.current_stop?.arrived_at ?? null,
      null,
      `cur-${cur.stop_order}`,
    );
  }

  for (const stop of result.upcoming_stops) {
    pushStop(
      stop.name,
      stop.stop_order,
      "upcoming",
      stop.latitude,
      stop.longitude,
      null,
      null,
      `u-${stop.stop_order}`,
    );
  }

  // Fallback: use only safe public origin / current / destination coordinates
  // when stop arrays do not include enough mappable points.
  if (stops.length < 2) {
    const fallback: DeliveryStop[] = [];
    const add = (
      name: string,
      stopOrder: number,
      status: StopStatus,
      latitude: number,
      longitude: number,
      idSuffix: string,
      arrivedAt?: string | null,
    ) => {
      if (!isValidCoordinate(latitude, longitude)) return;
      fallback.push({
        id: `public-${idSuffix}`,
        delivery_id: "public",
        name,
        latitude,
        longitude,
        stop_order: stopOrder,
        status,
        arrived_at: arrivedAt ?? null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      });
    };

    const delivered = result.status === "delivered";
    const curName =
      result.current_stop?.name ?? result.current_location?.name ?? null;
    const curLat =
      result.current_location?.latitude ??
      result.current_stop?.latitude ??
      null;
    const curLng =
      result.current_location?.longitude ??
      result.current_stop?.longitude ??
      null;
    const hasDistinctCurrent =
      Boolean(curName) &&
      curLat != null &&
      curLng != null &&
      curName !== result.origin.name &&
      curName !== result.destination.name;

    add(
      result.origin.name,
      1,
      delivered || hasDistinctCurrent
        ? "completed"
        : curName === result.origin.name
          ? "current"
          : "completed",
      result.origin.latitude,
      result.origin.longitude,
      "origin",
    );

    if (hasDistinctCurrent && curName && curLat != null && curLng != null) {
      add(
        curName,
        2,
        delivered ? "completed" : "current",
        curLat,
        curLng,
        "current",
        result.current_stop?.arrived_at,
      );
    }

    add(
      result.destination.name,
      3,
      delivered
        ? "completed"
        : curName === result.destination.name
          ? "current"
          : "upcoming",
      result.destination.latitude,
      result.destination.longitude,
      "dest",
    );

    if (fallback.length >= stops.length) {
      stops.length = 0;
      stops.push(...fallback);
    }
  }

  if (stops.length === 0) return null;

  const ordered = [...stops].sort((a, b) => a.stop_order - b.stop_order);
  const currentStop =
    ordered.find((s) => s.status === "current") ??
    (result.status === "delivered" ? ordered[ordered.length - 1] : null);

  return {
    origin: {
      name: result.origin.name,
      latitude: result.origin.latitude,
      longitude: result.origin.longitude,
    },
    destination: {
      name: result.destination.name,
      latitude: result.destination.latitude,
      longitude: result.destination.longitude,
    },
    stops: ordered,
    currentStop,
    completedStops: ordered.filter((s) => s.status === "completed"),
    upcomingStops: ordered.filter((s) => s.status === "upcoming"),
  };
}

export function publicTrackingHasMapCoordinates(
  result: Extract<PublicTrackingResult, { found: true }>,
): boolean {
  const candidates: Array<{ lat?: number | null; lng?: number | null }> = [
    { lat: result.origin.latitude, lng: result.origin.longitude },
    { lat: result.destination.latitude, lng: result.destination.longitude },
    {
      lat: result.current_location?.latitude,
      lng: result.current_location?.longitude,
    },
    ...result.completed_stops.map((s) => ({
      lat: s.latitude,
      lng: s.longitude,
    })),
    ...result.upcoming_stops.map((s) => ({
      lat: s.latitude,
      lng: s.longitude,
    })),
  ];

  return candidates.some(
    (c) => c.lat != null && c.lng != null && isValidCoordinate(c.lat, c.lng),
  );
}
