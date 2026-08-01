import { createClient } from "@/lib/supabase/server";
import type {
  ManualPaymentMethod,
  ManualPaymentStatus,
  Payment,
} from "@/lib/types/database";

export async function listCompanyPayments(
  companyId: string,
): Promise<Payment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("company_id", companyId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Payment[];
}

export async function listAllPayments(options?: {
  status?: string;
  method?: string;
  search?: string;
}): Promise<(Payment & { company_name?: string })[]> {
  const supabase = await createClient();
  let query = supabase
    .from("payments")
    .select("*, companies(name)")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status as ManualPaymentStatus);
  }
  if (options?.method && options.method !== "all") {
    query = query.eq(
      "payment_method",
      options.method as ManualPaymentMethod,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []).map((row) => {
    const r = row as unknown as Payment & {
      companies?: { name: string } | null;
    };
    return {
      ...(r as Payment),
      company_name: r.companies?.name,
    };
  });

  const search = options?.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter(
      (r) =>
        r.company_name?.toLowerCase().includes(search) ||
        r.reference?.toLowerCase().includes(search) ||
        r.notes?.toLowerCase().includes(search),
    );
  }

  return rows;
}

export async function getCompanyPaymentTotals(companyId: string) {
  const payments = await listCompanyPayments(companyId);
  const recorded = payments.filter((p) => p.status === "recorded");
  return {
    total_cents: recorded.reduce((sum, p) => sum + p.amount_cents, 0),
    currency: recorded[0]?.currency ?? "USD",
    last_payment: recorded[0] ?? null,
    count: recorded.length,
  };
}
