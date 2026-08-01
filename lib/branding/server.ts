import { createClient } from "@/lib/supabase/server";
import {
  resolveBrand,
  type CompanyBrandingRow,
  type ResolvedBrand,
} from "@/lib/branding";

export async function getCompanyBranding(
  companyId: string,
): Promise<CompanyBrandingRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_branding")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    // Table may not exist yet before migration — fall back silently
    if (process.env.NODE_ENV === "development") {
      console.warn("getCompanyBranding", error.message);
    }
    return null;
  }
  return (data as CompanyBrandingRow | null) ?? null;
}

export async function resolveCompanyBrand(options: {
  companyId?: string | null;
  companyName?: string | null;
  companySlug?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}): Promise<ResolvedBrand> {
  if (!options.companyId) {
    return resolveBrand({
      companyName: options.companyName,
      companySlug: options.companySlug,
      logo_url: options.logo_url,
      primary_color: options.primary_color,
    });
  }

  const branding = await getCompanyBranding(options.companyId);
  return resolveBrand({
    companyName: options.companyName,
    companySlug: options.companySlug,
    branding,
    logo_url: options.logo_url,
    primary_color: options.primary_color,
  });
}
