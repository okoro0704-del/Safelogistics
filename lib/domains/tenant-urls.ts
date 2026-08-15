import {
  getTenantSubdomainBase,
  tenantHostnameForSlug,
  tenantOriginForSlug,
} from "@/lib/domains/normalize";
import { tenantPreviewPath } from "@/lib/domains/preview";

export type TenantDeliverableUrls = {
  origin: string;
  previewPath: string;
  adminLoginUrl: string;
  customerLoginUrl: string;
  adminHomeUrl: string;
  customerHomeUrl: string;
  trackingUrl: string;
  previewUrl: string;
  usesManagedSubdomain: boolean;
};

/** Prefer managed subdomain; fall back to path preview on the current platform origin. */
export function buildTenantDeliverableUrls(
  slug: string,
  platformOrigin?: string | null,
): TenantDeliverableUrls {
  const managedOrigin = tenantOriginForSlug(slug);
  const managedHost = tenantHostnameForSlug(slug);
  const base =
    (platformOrigin || process.env.NEXT_PUBLIC_SITE_URL || "").replace(
      /\/$/,
      "",
    ) || "";

  if (managedOrigin && managedHost && getTenantSubdomainBase()) {
    return {
      origin: managedOrigin,
      previewPath: "/",
      adminLoginUrl: `${managedOrigin}/login`,
      customerLoginUrl: `${managedOrigin}/login`,
      adminHomeUrl: `${managedOrigin}/admin`,
      customerHomeUrl: `${managedOrigin}/dashboard`,
      trackingUrl: `${managedOrigin}/track`,
      previewUrl: managedOrigin,
      usesManagedSubdomain: true,
    };
  }

  const previewPath = tenantPreviewPath(slug);
  const origin = base || "";
  return {
    origin: origin || previewPath,
    previewPath,
    adminLoginUrl: `${origin}${previewPath}/login`,
    customerLoginUrl: `${origin}${previewPath}/login`,
    adminHomeUrl: `${origin}${previewPath}/admin`,
    customerHomeUrl: `${origin}${previewPath}/dashboard`,
    trackingUrl: `${origin}${previewPath}/track`,
    previewUrl: `${origin}${previewPath}`,
    usesManagedSubdomain: false,
  };
}
