import { createClient } from "@/lib/supabase/server";
import type {
  CustomerWithStats,
  DashboardStats,
  Delivery,
  DeliveryLocationHistory,
  DeliveryStatus,
  DeliveryStop,
  DeliveryWithRelations,
  Profile,
} from "@/lib/types/database";

type DeliveryListFilters = {
  search?: string;
  status?: DeliveryStatus | "all";
  page?: number;
  pageSize?: number;
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();

  const [deliveriesResult, customersResult] = await Promise.all([
    supabase.from("deliveries").select("status"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer"),
  ]);

  if (deliveriesResult.error) {
    throw new Error(deliveriesResult.error.message);
  }

  const rows = (deliveriesResult.data ?? []) as Array<{ status: DeliveryStatus }>;

  const stats: DashboardStats = {
    totalDeliveries: rows.length,
    pending: 0,
    inTransit: 0,
    atStop: 0,
    delivered: 0,
    cancelled: 0,
    delayed: 0,
    totalCustomers: customersResult.count ?? 0,
  };

  for (const row of rows) {
    switch (row.status) {
      case "pending":
        stats.pending += 1;
        break;
      case "in_transit":
        stats.inTransit += 1;
        break;
      case "at_stop":
        stats.atStop += 1;
        break;
      case "delivered":
        stats.delivered += 1;
        break;
      case "cancelled":
        stats.cancelled += 1;
        break;
      case "delayed":
        stats.delayed += 1;
        break;
    }
  }

  return stats;
}

export async function getRecentDeliveries(limit = 8): Promise<DeliveryWithRelations[]> {
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
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapDeliveryRow(row as Record<string, unknown>));
}

export async function getDeliveries(filters: DeliveryListFilters = {}) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = filters.search?.trim();

  let customerIds: string[] | null = null;
  if (search) {
    const { data: matchedCustomers, error: customerSearchError } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "customer")
      .ilike("full_name", `%${search}%`);

    if (customerSearchError) {
      throw new Error(customerSearchError.message);
    }

    customerIds = (matchedCustomers ?? []).map(
      (row) => (row as { id: string }).id,
    );
  }

  let query = supabase
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
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (search) {
    const escaped = search.replaceAll(",", " ");
    if (customerIds && customerIds.length > 0) {
      query = query.or(
        `tracking_number.ilike.%${escaped}%,reference_number.ilike.%${escaped}%,customer_id.in.(${customerIds.join(",")})`,
      );
    } else {
      query = query.or(
        `tracking_number.ilike.%${escaped}%,reference_number.ilike.%${escaped}%`,
      );
    }
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  return {
    deliveries: (data ?? []).map((row) =>
      mapDeliveryRow(row as Record<string, unknown>),
    ),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getDeliveryById(id: string) {
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

  if (!data) {
    return null;
  }

  const delivery = mapDeliveryRow(data as Record<string, unknown>);

  const { data: stops, error: stopsError } = await supabase
    .from("delivery_stops")
    .select("*")
    .eq("delivery_id", id)
    .order("stop_order", { ascending: true });

  if (stopsError) {
    throw new Error(stopsError.message);
  }

  const { data: history, error: historyError } = await supabase
    .from("delivery_location_history")
    .select("*")
    .eq("delivery_id", id)
    .order("created_at", { ascending: true });

  if (historyError) {
    throw new Error(historyError.message);
  }

  return {
    delivery,
    stops: (stops ?? []) as DeliveryStop[],
    history: (history ?? []) as DeliveryLocationHistory[],
  };
}

export async function getCustomers(search?: string): Promise<CustomerWithStats[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "customer")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let customers = (data ?? []) as Profile[];

  const term = search?.trim().toLowerCase();
  if (term) {
    customers = customers.filter(
      (customer) =>
        customer.full_name.toLowerCase().includes(term) ||
        customer.email.toLowerCase().includes(term) ||
        (customer.phone ?? "").toLowerCase().includes(term),
    );
  }

  const ids = customers.map((customer) => customer.id);
  const counts = new Map<string, number>();

  if (ids.length > 0) {
    const { data: deliveryRows, error: deliveryError } = await supabase
      .from("deliveries")
      .select("customer_id")
      .in("customer_id", ids);

    if (deliveryError) {
      throw new Error(deliveryError.message);
    }

    for (const row of deliveryRows ?? []) {
      const customerId = (row as { customer_id: string }).customer_id;
      counts.set(customerId, (counts.get(customerId) ?? 0) + 1);
    }
  }

  return customers.map((customer) => ({
    ...customer,
    delivery_count: counts.get(customer.id) ?? 0,
  }));
}

export async function getCustomerOptions() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "customer")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Array<Pick<Profile, "id" | "full_name" | "email">>;
}

export async function getCustomerById(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("role", "customer")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const customer = data as Profile;

  const { data: deliveries, error: deliveriesError } = await supabase
    .from("deliveries")
    .select(
      `
      *,
      current_stop:delivery_stops!deliveries_current_stop_id_fkey (
        id, name, stop_order, status
      )
    `,
    )
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  if (deliveriesError) {
    throw new Error(deliveriesError.message);
  }

  return {
    customer,
    deliveries: (deliveries ?? []).map((row) =>
      mapDeliveryRow({
        ...(row as Record<string, unknown>),
        customer,
      }),
    ),
  };
}
