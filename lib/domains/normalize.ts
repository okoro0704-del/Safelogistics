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
  return "_routeledger";
}

export function txtRecordFqdn(normalizedDomain: string): string {
  return `${txtRecordName()}.${normalizedDomain}`;
}

export function txtRecordValue(token: string): string {
  return `routeledger-verification=${token}`;
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
