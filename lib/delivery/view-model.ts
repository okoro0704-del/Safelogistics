import type {
  DeliveryLocationHistory,
  DeliveryStatus,
  DeliveryStop,
  DeliveryWithRelations,
} from "@/lib/types/database";

export type DeliveryMapModel = {
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  stops: DeliveryStop[];
  currentStop: DeliveryStop | null;
  completedStops: DeliveryStop[];
  upcomingStops: DeliveryStop[];
};

export type DeliveryViewModel = {
  delivery: DeliveryWithRelations;
  stops: DeliveryStop[];
  history: DeliveryLocationHistory[];
  currentStop: DeliveryStop | null;
  nextStop: DeliveryStop | null;
  progressPercent: number;
  canProceed: boolean;
  isTerminal: boolean;
  isDelivered: boolean;
  isCancelled: boolean;
  mapModel: DeliveryMapModel;
};

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
  const canProceed = !isTerminal;

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
    isTerminal,
    isDelivered,
    isCancelled,
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

export function proceedButtonLabel(nextStop: DeliveryStop | null) {
  if (nextStop) {
    return `Proceed to ${nextStop.name}`;
  }
  return "Mark as Delivered";
}
