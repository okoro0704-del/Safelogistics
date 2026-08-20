"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { friendlyErrorMessage, isValidLatitude, isValidLongitude } from "@/lib/format";
import type { Delivery, RouteStopInput } from "@/lib/types/database";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ProceedResult = {
  delivery: Delivery;
  status: string;
  is_delivered: boolean;
  current_stop_id: string | null;
  previous_stop_id: string | null;
};

export type CreateDeliveryInput = {
  customerId: string;
  referenceNumber?: string;
  description?: string;
  weight?: string;
  stops: RouteStopInput[];
};

export async function createDeliveryAction(
  input: CreateDeliveryInput,
): Promise<ActionResult<Delivery>> {
  try {
    if (!input.customerId) {
      return { ok: false, error: "Please select a customer." };
    }

    if (!input.stops || input.stops.length < 2) {
      return {
        ok: false,
        error: "Origin and destination are required.",
      };
    }

    for (const [index, stop] of input.stops.entries()) {
      if (!stop.name?.trim()) {
        return {
          ok: false,
          error: `Stop ${index + 1} needs a location name.`,
        };
      }
      if (!isValidLatitude(stop.latitude)) {
        return {
          ok: false,
          error: `Stop ${index + 1} has an invalid latitude.`,
        };
      }
      if (!isValidLongitude(stop.longitude)) {
        return {
          ok: false,
          error: `Stop ${index + 1} has an invalid longitude.`,
        };
      }
    }

    let weight: number | null = null;
    if (input.weight?.trim()) {
      weight = Number(input.weight);
      if (!Number.isFinite(weight) || weight < 0) {
        return { ok: false, error: "Weight must be a valid non-negative number." };
      }
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_delivery_with_stops", {
      p_customer_id: input.customerId,
      p_stops: input.stops.map((stop) => ({
        name: stop.name.trim(),
        latitude: stop.latitude,
        longitude: stop.longitude,
      })),
      p_reference_number: input.referenceNumber?.trim() || null,
      p_description: input.description?.trim() || null,
      p_weight: weight,
      p_estimated_delivery_at: null,
    });

    if (error || !data) {
      if (process.env.NODE_ENV === "development") {
        console.error("create_delivery_with_stops failed", error);
      }
      return {
        ok: false,
        error: friendlyErrorMessage(
          error?.message ?? "Unknown error",
          "We couldn't create this delivery. Please check the information and try again.",
        ),
      };
    }

    const delivery = data as Delivery;

    revalidatePath("/admin");
    revalidatePath("/admin/deliveries");
    revalidatePath(`/admin/customers/${input.customerId}`);

    return { ok: true, data: delivery };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("createDeliveryAction", error);
    }
    return {
      ok: false,
      error: friendlyErrorMessage(
        error,
        "We couldn't create this delivery. Please check the information and try again.",
      ),
    };
  }
}

export async function proceedToNextStopAction(
  deliveryId: string,
): Promise<ActionResult<ProceedResult>> {
  try {
    if (!deliveryId) {
      return { ok: false, error: "Delivery id is required." };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("proceed_to_next_stop", {
      p_delivery_id: deliveryId,
    });

    if (error || !data) {
      if (process.env.NODE_ENV === "development") {
        console.error("proceed_to_next_stop failed", error);
      }
      return {
        ok: false,
        error: friendlyErrorMessage(
          error?.message ?? "Unknown error",
          "Unable to advance this delivery. The delivery may have already been updated. Please refresh and try again.",
        ),
      };
    }

    const payload = data as {
      delivery: Delivery;
      status: string;
      is_delivered: boolean;
      current_stop_id: string | null;
      previous_stop_id: string | null;
    };

    revalidatePath("/admin");
    revalidatePath("/admin/deliveries");
    revalidatePath(`/admin/deliveries/${deliveryId}`);
    if (payload.delivery?.customer_id) {
      revalidatePath(`/admin/customers/${payload.delivery.customer_id}`);
    }

    return {
      ok: true,
      data: {
        delivery: payload.delivery,
        status: payload.status,
        is_delivered: payload.is_delivered,
        current_stop_id: payload.current_stop_id,
        previous_stop_id: payload.previous_stop_id,
      },
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("proceedToNextStopAction", error);
    }
    return {
      ok: false,
      error: friendlyErrorMessage(
        error,
        "Unable to advance this delivery. Please refresh and try again.",
      ),
    };
  }
}

export async function scheduleDeliveryMovementAction(
  deliveryId: string,
  startsAtIso: string,
  durationMinutes: number,
): Promise<ActionResult<{ status: string }>> {
  try {
    if (!deliveryId) {
      return { ok: false, error: "Delivery id is required." };
    }
    if (!startsAtIso || Number.isNaN(Date.parse(startsAtIso))) {
      return { ok: false, error: "Choose a valid movement start time." };
    }
    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 10080
    ) {
      return {
        ok: false,
        error: "Transit duration must be between 1 minute and 7 days.",
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("schedule_delivery_movement", {
      p_delivery_id: deliveryId,
      p_starts_at: new Date(startsAtIso).toISOString(),
      p_duration_minutes: Math.round(durationMinutes),
    });

    if (error || !data) {
      if (process.env.NODE_ENV === "development") {
        console.error("schedule_delivery_movement failed", error);
      }
      return {
        ok: false,
        error: friendlyErrorMessage(
          error?.message ?? "Unknown error",
          "Unable to schedule movement. Please refresh and try again.",
        ),
      };
    }

    const payload = data as { status?: string; delivery?: Delivery };

    revalidatePath("/admin");
    revalidatePath("/admin/deliveries");
    revalidatePath(`/admin/deliveries/${deliveryId}`);
    if (payload.delivery?.customer_id) {
      revalidatePath(`/admin/customers/${payload.delivery.customer_id}`);
    }

    return {
      ok: true,
      data: { status: payload.status ?? payload.delivery?.status ?? "in_transit" },
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("scheduleDeliveryMovementAction", error);
    }
    return {
      ok: false,
      error: friendlyErrorMessage(
        error,
        "Unable to schedule movement. Please refresh and try again.",
      ),
    };
  }
}

export async function finalizeDeliveryMovementAction(
  deliveryId: string,
): Promise<ActionResult<{ finalized: boolean }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "finalize_delivery_movement_if_due",
      {
        p_delivery_id: deliveryId,
        p_tracking_number: null,
      },
    );
    if (error) {
      return {
        ok: false,
        error: friendlyErrorMessage(error.message, "Unable to update movement."),
      };
    }
    const payload = data as { finalized?: boolean };
    revalidatePath(`/admin/deliveries/${deliveryId}`);
    return { ok: true, data: { finalized: Boolean(payload?.finalized) } };
  } catch (error) {
    return {
      ok: false,
      error: friendlyErrorMessage(error, "Unable to update movement."),
    };
  }
}
