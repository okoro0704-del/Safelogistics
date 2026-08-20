/**
 * Custom domain helpers — hostname normalization & validation.
 * Automatic DNS / SSL are not implemented yet (Prompt 12).
 */

const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

export type CompanyDomainStatus =
  | "pending"
  | "provisioning"
  | "verifying"
  | "active"
  | "disabled"
  | "failed";

export type DomainInfraStatus =
  | "pending"
  | "configured"
  | "failed"
  | "manual"
  | "ready"
  | "provisioning"
  | "unknown";

export type CompanyDomain = {
  id: string;
  company_id: string;
  domain: string;
  normalized_domain: string;
  is_primary: boolean;
  status: CompanyDomainStatus;
  verification_token: string;
  verified_at: string | null;
  last_verification_attempt_at: string | null;
  created_at: string;
  updated_at: string;
  dns_provider?: string | null;
  hosting_provider?: string | null;
  dns_status?: string | null;
  hosting_status?: string | null;
  ssl_status?: string | null;
  last_error?: string | null;
  last_checked_at?: string | null;
  activated_at?: string | null;
  dns_target_record_id?: string | null;
  dns_txt_record_id?: string | null;
  hosting_domain_id?: string | null;
  provider_zone_id?: string | null;
  acquisition_source?: "manual" | "namecheap" | null;
  registrar_order_id?: string | null;
  expires_at?: string | null;
};

export type ResolvedTenant = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  domain_id: string;
  domain: string;
  is_primary: boolean;
};

/** Canonical hostname for storage/comparison. */
export function normalizeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//i, "");
  value = value.split("/")[0] ?? "";
  value = value.split("?")[0] ?? "";
  value = value.split("#")[0] ?? "";
  value = value.replace(/:\d+$/, "");
  value = value.replace(/\.$/, "");
  value = value.trim();
  return value || null;
}

export function isValidHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  if (hostname.length > 253) return false;
  if (!HOSTNAME_PATTERN.test(hostname)) return false;
  if (BLOCKED_HOSTS.has(hostname)) return false;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return false;
  }
  // *.localhost allowed for local development demos
  return true;
}

export function txtRecordName(): string {
  return "_parcelmovement";
}

/** Legacy TXT host used by older tenants. */
export function legacyTxtRecordName(): string {
  return "_routeledger";
}

export function txtRecordFqdn(normalizedDomain: string): string {
  return `${txtRecordName()}.${normalizedDomain}`;
}

export function txtRecordValue(token: string): string {
  return `parcelmovement-verification=${token}`;
}

export function legacyTxtRecordValue(token: string): string {
  return `routeledger-verification=${token}`;
}

/** Apex for automatic tenant hosts, e.g. apps.webfinance.app */
export function getTenantSubdomainBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE?.trim().toLowerCase();
  if (!raw) return null;
  return normalizeHostname(raw);
}

export function tenantHostnameForSlug(slug: string): string | null {
  const base = getTenantSubdomainBase();
  const normalizedSlug = slug.trim().toLowerCase();
  if (!base || !normalizedSlug) return null;
  return `${normalizedSlug}.${base}`;
}

export function tenantOriginForSlug(slug: string): string | null {
  const host = tenantHostnameForSlug(slug);
  if (!host) return null;
  return `https://${host}`;
}

const RESERVED_APEX_LABELS = new Set([
  "www",
  "mm",
  "pm",
  "app",
  "apps",
  "api",
  "mail",
  "inbound",
  "hub",
  "master",
  "admin",
  "cdn",
  "static",
  "webfinance",
  "distributor",
  "safeogistics",
]);

/** Apex tenant hosts: {slug}.webfinance.app (excludes pm/mm/apps/dN/…). */
export function parseApexTenantHostname(
  hostname: string | null | undefined,
): string | null {
  const host = normalizeHostname(hostname);
  if (!host) return null;
  const apex =
    normalizeHostname(process.env.NEXT_PUBLIC_MANAGED_APEX_DOMAIN) ||
    "webfinance.app";
  if (host === apex || !host.endsWith(`.${apex}`)) return null;
  const slug = host.slice(0, -(apex.length + 1));
  if (!slug || slug.includes(".")) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  if (RESERVED_APEX_LABELS.has(slug)) return null;
  if (/^d\d+$/.test(slug)) return null; // distributor slots d1…d100
  return slug;
}

/** Parse {slug}.{TENANT_SUBDOMAIN_BASE} or apex {slug}.webfinance.app → slug. */
export function parseTenantSubdomainHostname(
  hostname: string | null | undefined,
): string | null {
  const host = normalizeHostname(hostname);
  const base = getTenantSubdomainBase();
  if (host && base) {
    if (host !== base && host.endsWith(`.${base}`)) {
      const slug = host.slice(0, -(base.length + 1));
      if (slug && !slug.includes(".") && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return slug;
      }
    }
  }
  return parseApexTenantHostname(host);
}

export function isManagedTenantSubdomain(
  hostname: string | null | undefined,
): boolean {
  return Boolean(parseTenantSubdomainHostname(hostname));
}

export function generateVerificationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Platform hosts that should never be treated as company custom domains. */
export function getPlatformHostnames(): Set<string> {
  const configured = process.env.NEXT_PUBLIC_PLATFORM_HOSTS ?? "";
  const hosts = configured
    .split(",")
    .map((h) => normalizeHostname(h))
    .filter((h): h is string => Boolean(h));

  const defaults = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "[::1]",
    "::1",
  ];

  return new Set([...defaults, ...hosts]);
}

export function isPlatformHostname(hostname: string | null | undefined): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (getPlatformHostnames().has(host)) return true;
  // Vercel / preview style hosts without an explicit domain mapping
  if (host.endsWith(".vercel.app")) return true;
  if (host.endsWith(".netlify.app")) return true;
  return false;
}

export function isLocalDevHostname(hostname: string): boolean {
  return (
    hostname.endsWith(".localhost") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}
