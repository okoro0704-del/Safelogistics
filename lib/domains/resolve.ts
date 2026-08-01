import { headers } from "next/headers";

import { resolveCompanyBrand } from "@/lib/branding/server";
import type { ResolvedBrand } from "@/lib/branding";
import {
  TENANT_COMPANY_ID_HEADER,
  TENANT_COMPANY_NAME_HEADER,
  TENANT_COMPANY_SLUG_HEADER,
  TENANT_DOMAIN_HEADER,
} from "@/lib/domains/headers";
import {
  normalizeHostname,
  type ResolvedTenant,
} from "@/lib/domains/normalize";
import { resolveCompanyFromHostname } from "@/lib/domains/resolve-hostname";
import { createClient } from "@/lib/supabase/server";

export {
  TENANT_COMPANY_ID_HEADER,
  TENANT_COMPANY_NAME_HEADER,
  TENANT_COMPANY_SLUG_HEADER,
  TENANT_DOMAIN_HEADER,
} from "@/lib/domains/headers";

export {
  invalidateDomainCache,
  resolveCompanyFromHostname,
} from "@/lib/domains/resolve-hostname";

export type RequestTenantContext = {
  hostname: string | null;
  isCustomDomain: boolean;
  tenant: ResolvedTenant | null;
  brand: ResolvedBrand;
};

/**
 * Read tenant context set by middleware headers, with a safe DB fallback.
 * Hostname is a routing hint only — never use alone for authorization.
 */
export async function getRequestTenantContext(): Promise<RequestTenantContext> {
  const headerStore = await headers();
  const hostHeader = headerStore.get("host") || null;
  const tenantId = headerStore.get(TENANT_COMPANY_ID_HEADER);
  const tenantDomain = headerStore.get(TENANT_DOMAIN_HEADER);
  const tenantSlug = headerStore.get(TENANT_COMPANY_SLUG_HEADER);
  const tenantName = headerStore.get(TENANT_COMPANY_NAME_HEADER);

  const hostname = normalizeHostname(hostHeader);

  if (tenantId && tenantDomain) {
    const tenant: ResolvedTenant = {
      company_id: tenantId,
      company_name: tenantName || "Company",
      company_slug: tenantSlug || "",
      company_status: "active",
      domain_id: "",
      domain: tenantDomain,
      is_primary: false,
    };
    const brand = await resolveCompanyBrand({
      companyId: tenant.company_id,
      companyName: tenant.company_name,
      companySlug: tenant.company_slug,
    });
    return {
      hostname,
      isCustomDomain: true,
      tenant,
      brand,
    };
  }

  const supabase = await createClient();
  const tenant = await resolveCompanyFromHostname(hostname, supabase);
  if (!tenant) {
    return {
      hostname,
      isCustomDomain: false,
      tenant: null,
      brand: await resolveCompanyBrand({}),
    };
  }

  const brand = await resolveCompanyBrand({
    companyId: tenant.company_id,
    companyName: tenant.company_name,
    companySlug: tenant.company_slug,
  });

  return {
    hostname,
    isCustomDomain: true,
    tenant,
    brand,
  };
}
