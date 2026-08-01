import { createClient } from "@/lib/supabase/client";
import type {
  DeliveryLocationHistory,
  DeliveryStop,
  DeliveryWithRelations,
  Profile,
} from "@/lib/types/database";

function mapDeliveryRow(row: Record<string, unknown>): DeliveryWithRelations {
  const customer = row.customer as Profile | Profile[] | null;
  const currentStop = row.current_stop as DeliveryStop | DeliveryStop[] | null;

  return {
    ...(row as unknown as DeliveryWithRelations),
    customer: Array.isArray(customer)
      ? customer[0]
        ? {
            id: customer[0].id,
            full_name: customer[0].full_name,
            email: customer[0].email,
            phone: customer[0].phone,
          }
        : null
      : customer
        ? {
            id: customer.id,
            full_name: customer.full_name,
            email: customer.email,
            phone: customer.phone,
          }
        : null,
    current_stop: Array.isArray(currentStop)
      ? currentStop[0]
        ? {
            id: currentStop[0].id,
            name: currentStop[0].name,
            stop_order: currentStop[0].stop_order,
            status: currentStop[0].status,
          }
        : null
      : currentStop
        ? {
            id: currentStop.id,
            name: currentStop.name,
            stop_order: currentStop.stop_order,
            status: currentStop.status,
          }
        : null,
  };
}

export async function fetchDeliveryDetailClient(id: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("deliveries")
    .select(
      `
      *,
      customer:profiles!deliveries_customer_id_fkey (
        id, full_name, email, phone
      ),
      current_stop:delivery_stops!deliveries_current_stop_id_fkey (
        id, name, stop_order, status
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const delivery = mapDeliveryRow(data as Record<string, unknown>);

  const [{ data: stops, error: stopsError }, { data: history, error: historyError }] =
    await Promise.all([
      supabase
        .from("delivery_stops")
        .select("*")
        .eq("delivery_id", id)
        .order("stop_order", { ascending: true }),
      supabase
        .from("delivery_location_history")
        .select("*")
        .eq("delivery_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (stopsError) throw new Error(stopsError.message);
  if (historyError) throw new Error(historyError.message);

  return {
    delivery,
    stops: (stops ?? []) as DeliveryStop[],
    history: (history ?? []) as DeliveryLocationHistory[],
  };
}
