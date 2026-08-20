import type {
  DeliveryLocationHistory,
  DeliveryMovement,
  DeliveryStatus,
  DeliveryStop,
  DeliveryWithRelations,
} from "@/lib/types/database";

export type MapTransitLeg = {
  fromLngLat: [number, number];
  toLngLat: [number, number];
  fromName: string;
  toName: string;
  startedAt: string;
  durationMinutes: number;
  endsAt: string;
};

export type DeliveryMapModel = {
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  stops: DeliveryStop[];
  currentStop: DeliveryStop | null;
  completedStops: DeliveryStop[];
  upcomingStops: DeliveryStop[];
  transit: MapTransitLeg | null;
};

export type DeliveryViewModel = {
  delivery: DeliveryWithRelations;
  stops: DeliveryStop[];
  history: DeliveryLocationHistory[];
  currentStop: DeliveryStop | null;
  nextStop: DeliveryStop | null;
  progressPercent: number;
  canProceed: boolean;
  canScheduleMovement: boolean;
  hasActiveMovement: boolean;
  isTerminal: boolean;
  isDelivered: boolean;
  isCancelled: boolean;
  mapModel: DeliveryMapModel;
  movement: DeliveryMovement | null;
};

function buildTransitFromStops(
  from: DeliveryStop | null | undefined,
  to: DeliveryStop | null | undefined,
  startedAt: string | null | undefined,
  durationMinutes: number | null | undefined,
): MapTransitLeg | null {
  if (!from || !to || !startedAt || !durationMinutes || durationMinutes < 1) {
    return null;
  }
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const endsAt = new Date(start + durationMinutes * 60_000).toISOString();
  return {
    fromLngLat: [from.longitude, from.latitude],
    toLngLat: [to.longitude, to.latitude],
    fromName: from.name,
    toName: to.name,
    startedAt,
    durationMinutes,
    endsAt,
  };
}

export function movementToTransit(
  movement: DeliveryMovement | null | undefined,
): MapTransitLeg | null {
  if (!movement) return null;
  return {
    fromLngLat: [movement.from.longitude, movement.from.latitude],
    toLngLat: [movement.to.longitude, movement.to.latitude],
    fromName: movement.from.name,
    toName: movement.to.name,
    startedAt: movement.started_at,
    durationMinutes: movement.duration_minutes,
    endsAt: movement.ends_at,
  };
}

/** Progress 0..1 along a scheduled transit leg based on wall clock. */
export function transitProgress(
  startedAt: string,
  durationMinutes: number,
  nowMs = Date.now(),
): number {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start) || durationMinutes <= 0) return 0;
  const t = (nowMs - start) / (durationMinutes * 60_000);
  return Math.max(0, Math.min(1, t));
}

export function interpolateLngLat(
  from: [number, number],
  to: [number, number],
  t: number,
): [number, number] {
  const p = Math.max(0, Math.min(1, t));
  return [from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p];
}

export function buildDeliveryViewModel(
  delivery: DeliveryWithRelations,
  stops: DeliveryStop[],
  history: DeliveryLocationHistory[],
): DeliveryViewModel {
  const ordered = [...stops].sort((a, b) => a.stop_order - b.stop_order);
  const currentStop =
    ordered.find((stop) => stop.status === "current") ??
    ordered.find((stop) => stop.id === delivery.current_stop_id) ??
    null;
  const nextStop = currentStop
    ? (ordered.find((stop) => stop.stop_order === currentStop.stop_order + 1) ??
      null)
    : null;

  const isDelivered = delivery.status === "delivered";
  const isCancelled = delivery.status === "cancelled";
  const isTerminal = isDelivered || isCancelled;
  const hasActiveMovement = Boolean(
    delivery.movement_started_at &&
      delivery.movement_duration_minutes &&
      delivery.movement_from_stop_id &&
      delivery.movement_to_stop_id,
  );
  const canProceed = !isTerminal;
  const canScheduleMovement = !isTerminal && Boolean(nextStop) && !hasActiveMovement;

  const fromStop =
    ordered.find((s) => s.id === delivery.movement_from_stop_id) ?? currentStop;
  const toStop =
    ordered.find((s) => s.id === delivery.movement_to_stop_id) ?? nextStop;

  const transit = hasActiveMovement
    ? buildTransitFromStops(
        fromStop,
        toStop,
        delivery.movement_started_at,
        delivery.movement_duration_minutes,
      )
    : null;

  const movement: DeliveryMovement | null =
    transit && fromStop && toStop
      ? {
          started_at: transit.startedAt,
          duration_minutes: transit.durationMinutes,
          ends_at: transit.endsAt,
          from: {
            id: fromStop.id,
            name: fromStop.name,
            latitude: fromStop.latitude,
            longitude: fromStop.longitude,
            stop_order: fromStop.stop_order,
          },
          to: {
            id: toStop.id,
            name: toStop.name,
            latitude: toStop.latitude,
            longitude: toStop.longitude,
            stop_order: toStop.stop_order,
          },
        }
      : null;

  return {
    delivery,
    stops: ordered,
    history: [...history].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
    currentStop,
    nextStop,
    progressPercent: calculateRouteProgress(ordered, delivery.status, currentStop),
    canProceed,
    canScheduleMovement,
    hasActiveMovement,
    isTerminal,
    isDelivered,
    isCancelled,
    movement,
    mapModel: {
      origin: {
        name: delivery.origin_name,
        latitude: delivery.origin_latitude,
        longitude: delivery.origin_longitude,
      },
      destination: {
        name: delivery.destination_name,
        latitude: delivery.destination_latitude,
        longitude: delivery.destination_longitude,
      },
      stops: ordered,
      currentStop,
      completedStops: ordered.filter((stop) => stop.status === "completed"),
      upcomingStops: ordered.filter((stop) => stop.status === "upcoming"),
      transit,
    },
  };
}

/**
 * Progress is based on stop sequence:
 * - delivered => 100%
 * - otherwise ((currentOrder - 1) / (totalStops - 1)) * 100
 */
export function calculateRouteProgress(
  stops: DeliveryStop[],
  status: DeliveryStatus,
  currentStop: DeliveryStop | null,
) {
  if (status === "delivered") return 100;
  if (stops.length <= 1) {
    return currentStop ? 100 : 0;
  }
  if (!currentStop) return 0;

  const ratio = (currentStop.stop_order - 1) / (stops.length - 1);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export function proceedButtonLabel(
  nextStop: DeliveryStop | null,
  hasActiveMovement?: boolean,
) {
  if (hasActiveMovement) {
    return nextStop ? `Arrive at ${nextStop.name} now` : "Arrive now";
  }
  if (nextStop) {
    return `Jump to ${nextStop.name}`;
  }
  return "Mark as Delivered";
}
