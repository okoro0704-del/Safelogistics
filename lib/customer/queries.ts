import { createClient } from "@/lib/supabase/server";
import type {
  Delivery,
  DeliveryLocationHistory,
  DeliveryStatus,
  DeliveryStop,
  DeliveryWithRelations,
  Profile,
} from "@/lib/types/database";

export type CustomerDeliveryStats = {
  total: number;
  active: number;
  delivered: number;
  pending: number;
  delayed: number;
  cancelled: number;
};

export type CustomerDeliveryListItem = DeliveryWithRelations & {
  stops: Pick<DeliveryStop, "id" | "name" | "stop_order" | "status">[];
};

function mapDeliveryRow(row: Record<string, unknown>): DeliveryWithRelations {
  const customer = row.customer as Profile | Profile[] | null;
  const currentStop = row.current_stop as DeliveryStop | DeliveryStop[] | null;

  return {
    ...(row as unknown as Delivery),
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

function mapListItem(row: Record<string, unknown>): CustomerDeliveryListItem {
  const stopsRaw = row.delivery_stops as
    | Array<Pick<DeliveryStop, "id" | "name" | "stop_order" | "status">>
    | null;
  const delivery = mapDeliveryRow(row);
  return {
    ...delivery,
    stops: [...(stopsRaw ?? [])].sort((a, b) => a.stop_order - b.stop_order),
  };
}

const LIST_SELECT = `
  *,
  current_stop:delivery_stops!deliveries_current_stop_id_fkey (
    id, name, stop_order, status
  ),
  delivery_stops (
    id, name, stop_order, status
  )
`;

/**
 * Customer queries rely on RLS (`customer_id = auth.uid()`).
 * Do not accept client-provided customer_id for authorization.
 */
export async function getCustomerDeliveryStats(): Promise<CustomerDeliveryStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliveries").select("status");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{ status: DeliveryStatus }>;
  const stats: CustomerDeliveryStats = {
    total: rows.length,
    active: 0,
    delivered: 0,
    pending: 0,
    delayed: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    switch (row.status) {
      case "delivered":
        stats.delivered += 1;
        break;
      case "cancelled":
        stats.cancelled += 1;
        break;
      case "pending":
        stats.pending += 1;
        stats.active += 1;
        break;
      case "delayed":
        stats.delayed += 1;
        stats.active += 1;
        break;
      case "in_transit":
      case "at_stop":
        stats.active += 1;
        break;
    }
  }

  return stats;
}

export async function getCustomerDeliveries(search?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("deliveries")
    .select(LIST_SELECT)
    .order("created_at", { ascending: false });

  const term = search?.trim();
  if (term) {
    query = query.ilike("tracking_number", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    mapListItem(row as Record<string, unknown>),
  );
}

export async function getCustomerActiveDeliveries(limit = 6) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("deliveries")
    .select(LIST_SELECT)
    .in("status", ["pending", "in_transit", "at_stop", "delayed"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    mapListItem(row as Record<string, unknown>),
  );
}

export async function getCustomerDeliveryById(id: string) {
  const supabase = await createClient();

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

  // RLS returns null for inaccessible rows — treat as not found (no leak).
  if (!data) {
    return null;
  }

  const delivery = mapDeliveryRow(data as Record<string, unknown>);

  const [
    { data: stops, error: stopsError },
    { data: history, error: historyError },
  ] = await Promise.all([
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
