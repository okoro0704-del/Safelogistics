import type { CompanySettingsRow } from "@/lib/company-settings";
import { createClient } from "@/lib/supabase/server";
import type { Company, CompanyStatus, Profile } from "@/lib/types/database";

export type PlatformStats = {
  companies: number;
  active_companies: number;
  suspended_companies: number;
  total_deliveries: number;
  active_deliveries: number;
  total_admins: number;
  total_customers: number;
};

export type CompanyListItem = Company & {
  admin_count: number;
  customer_count: number;
  delivery_count: number;
  active_delivery_count: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("master_platform_stats");
  if (error) {
    throw new Error(error.message || "Unable to load platform stats.");
  }
  const row = data as PlatformStats | null;
  if (!row || typeof row !== "object") {
    throw new Error("Platform stats returned an unexpected response.");
  }
  return {
    companies: Number(row.companies ?? 0),
    active_companies: Number(row.active_companies ?? 0),
    suspended_companies: Number(row.suspended_companies ?? 0),
    total_deliveries: Number(row.total_deliveries ?? 0),
    active_deliveries: Number(row.active_deliveries ?? 0),
    total_admins: Number(row.total_admins ?? 0),
    total_customers: Number(row.total_customers ?? 0),
  };
}

export async function listCompanies(options?: {
  search?: string;
  status?: CompanyStatus | "all";
}): Promise<CompanyListItem[]> {
  const supabase = await createClient();
  const search = options?.search?.trim() ?? "";
  const status = options?.status ?? "all";

  let query = supabase
    .from("companies")
    .select(
      "id, name, slug, status, description, email, phone, logo_url, primary_color, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  }

  const { data: companies, error } = await query;
  if (error) throw error;
  const rows = (companies as Company[]) ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((c) => c.id);

  const [profilesRes, deliveriesRes] = await Promise.all([
    supabase.from("profiles").select("company_id, role").in("company_id", ids),
    supabase
      .from("deliveries")
      .select("company_id, status")
      .in("company_id", ids),
  ]);

  const profileRows =
    (profilesRes.data as Array<{ company_id: string | null; role: string }> | null) ??
    [];
  const deliveryRows =
    (deliveriesRes.data as Array<{ company_id: string; status: string }> | null) ??
    [];

  return rows.map((company) => {
    const companyProfiles = profileRows.filter(
      (p) => p.company_id === company.id,
    );
    const companyDeliveries = deliveryRows.filter(
      (d) => d.company_id === company.id,
    );
    return {
      ...company,
      admin_count: companyProfiles.filter((p) => p.role === "admin").length,
      customer_count: companyProfiles.filter((p) => p.role === "customer")
        .length,
      delivery_count: companyDeliveries.length,
      active_delivery_count: companyDeliveries.filter((d) =>
        ["pending", "in_transit", "at_stop", "delayed"].includes(d.status),
      ).length,
    };
  });
}

export async function getCompanyDetail(companyId: string) {
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw error;
  if (!company) return null;

  const [{ data: admins }, { count: customerCount }, { data: deliveries }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, created_at, role")
        .eq("company_id", companyId)
        .eq("role", "admin")
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("role", "customer"),
      supabase.from("deliveries").select("id, status").eq("company_id", companyId),
    ]);

  const deliveryRows =
    (deliveries as Array<{ id: string; status: string }> | null) ?? [];

  return {
    company: company as Company,
    admins: (admins as Profile[]) ?? [],
    customer_count: customerCount ?? 0,
    delivery_count: deliveryRows.length,
    active_delivery_count: deliveryRows.filter((d) =>
      ["pending", "in_transit", "at_stop", "delayed"].includes(d.status),
    ).length,
  };
}

export async function getCompanySettings(
  companyId: string,
): Promise<CompanySettingsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("getCompanySettings", error.message);
    }
    return null;
  }

  return (data as CompanySettingsRow | null) ?? null;
}
