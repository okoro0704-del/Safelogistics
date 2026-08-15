import {
  getCustomDomainTarget,
  createDnsProvider,
  getConfiguredDnsProviderId,
  isApexHostname,
} from "@/lib/domains/providers/dns";
import { DnsProviderError } from "@/lib/domains/providers/dns/types";
import { createHostingProvider, getConfiguredHostingProviderId } from "@/lib/domains/providers/hosting";
import { HostingProviderError } from "@/lib/domains/providers/hosting/types";
import {
  getTenantSubdomainBase,
  isLocalDevHostname,
  isManagedTenantSubdomain,
  normalizeHostname,
  txtRecordFqdn,
  txtRecordName,
  txtRecordValue,
  type CompanyDomain,
} from "@/lib/domains/normalize";
import { verifyDomainTxtRecord } from "@/lib/domains/verify-dns";
import { promises as dns } from "dns";

export type DomainHealth = {
  dnsConfigured: boolean;
  dnsTargetOk: boolean | null;
  ownershipVerified: boolean;
  hostingReady: boolean;
  sslReady: boolean;
  canActivate: boolean;
  manualFallback: boolean;
  messages: string[];
  steps: Array<{ id: string; label: string; done: boolean; active?: boolean }>;
};

export function buildManualDnsInstructions(domain: CompanyDomain) {
  const target = getCustomDomainTarget();
  const records: Array<{ type: string; name: string; value: string; note?: string }> =
    [
      {
        type: "TXT",
        name: txtRecordName(),
        value: txtRecordValue(domain.verification_token),
        note: "Ownership verification",
      },
    ];

  if (target) {
    records.unshift({
      type: "CNAME",
      name: isApexHostname(domain.normalized_domain) ? "@" : domain.normalized_domain.split(".")[0]!,
      value: target,
      note: isApexHostname(domain.normalized_domain)
        ? "Apex may require ALIAS/ANAME or Cloudflare CNAME flattening"
        : "Points traffic to the application",
    });
  }

  return {
    hostname: domain.normalized_domain,
    target,
    records,
    txtFqdn: txtRecordFqdn(domain.normalized_domain),
  };
}

function safeProviderError(error: unknown): string {
  if (error instanceof DnsProviderError) {
    if (error.code === "auth" || error.code === "not_configured") {
      return "Automatic DNS setup is currently unavailable. Please try again or use manual DNS configuration.";
    }
    if (error.code === "timeout") {
      return "DNS provider timed out. Please try again or use manual DNS configuration.";
    }
  }
  if (error instanceof HostingProviderError) {
    if (error.code === "auth" || error.code === "not_configured") {
      return "Automatic hosting setup is currently unavailable. Please try again or use manual DNS configuration.";
    }
  }
  return "We couldn't configure DNS automatically. Please try again or use manual DNS configuration.";
}

export async function provisionCompanyDomain(domain: CompanyDomain): Promise<{
  domainPatch: Record<string, unknown>;
  message: string;
  manualFallback: boolean;
  health?: DomainHealth;
}> {
  const dnsProviderId = getConfiguredDnsProviderId();
  const hostingProviderId = getConfiguredHostingProviderId();
  const target = getCustomDomainTarget();
  const hostname = domain.normalized_domain;
  const tenantBase = getTenantSubdomainBase();
  const normalizedHost = normalizeHostname(hostname) ?? hostname;

  // Wildcard tenant hosts are served by the platform site — never register
  // per-tenant Netlify/DNS records for *.apps.webfinance.app.
  if (
    isManagedTenantSubdomain(normalizedHost) ||
    (tenantBase &&
      (normalizedHost === tenantBase ||
        normalizedHost.endsWith(`.${tenantBase}`)))
  ) {
    return {
      domainPatch: {
        status: "active",
        dns_provider: "platform",
        hosting_provider: "platform",
        dns_status: "configured",
        hosting_status: "ready",
        ssl_status: "ready",
        last_error: null,
        dns_target_record_id: "managed-subdomain",
        dns_txt_record_id: "managed-subdomain",
        hosting_domain_id: `managed-${normalizedHost}`,
      },
      message:
        "Managed platform subdomain is already covered by the wildcard DNS and certificate. No per-tenant registrar or hosting setup is required.",
      manualFallback: false,
    };
  }

  // Localhost shortcut — no real infrastructure
  if (isLocalDevHostname(hostname) && process.env.NODE_ENV !== "production") {
    return {
      domainPatch: {
        status: "verifying",
        dns_provider: "mock",
        hosting_provider: "mock",
        dns_status: "configured",
        hosting_status: "ready",
        ssl_status: "ready",
        last_error: null,
        dns_target_record_id: "local-target",
        dns_txt_record_id: "local-txt",
        hosting_domain_id: `local-${hostname}`,
      },
      message: "Local domain prepared. Click Check Status to activate.",
      manualFallback: false,
    };
  }

  if (dnsProviderId === "none" && hostingProviderId === "none") {
    return {
      domainPatch: {
        status: "pending",
        dns_status: "manual",
        hosting_status: "manual",
        ssl_status: "unknown",
        last_error: null,
      },
      message:
        "Automatic DNS setup is unavailable. Add the DNS records manually, then verify ownership.",
      manualFallback: true,
    };
  }

  let dnsTargetRecordId = domain.dns_target_record_id;
  let dnsTxtRecordId = domain.dns_txt_record_id;
  let hostingDomainId = domain.hosting_domain_id;
  let providerZoneId = domain.provider_zone_id;
  let dnsStatus = domain.dns_status ?? "pending";
  let hostingStatus = domain.hosting_status ?? "pending";
  let sslStatus = domain.ssl_status ?? "pending";

  try {
    const hosting = createHostingProvider();
    if (hosting) {
      const hostResult = await hosting.addDomain(hostname);
      hostingDomainId = hostResult.providerDomainId ?? hostname;
      hostingStatus = hostResult.configured ? "configured" : "pending";
      sslStatus = hostResult.sslReady
        ? "ready"
        : hostResult.verified
          ? "provisioning"
          : "pending";
      if (hostResult.verified) hostingStatus = "ready";
    } else if (hostingProviderId === "none") {
      hostingStatus = "manual";
      sslStatus = "unknown";
    }

    const dns = createDnsProvider();
    if (dns) {
      if (!target && dnsProviderId !== "mock") {
        throw new DnsProviderError(
          "CUSTOM_DOMAIN_TARGET is required for automatic DNS",
          "not_configured",
        );
      }

      if ("resolveZoneId" in dns && typeof (dns as { resolveZoneId?: (h: string) => Promise<string> }).resolveZoneId === "function") {
        providerZoneId = await (
          dns as { resolveZoneId: (h: string) => Promise<string> }
        ).resolveZoneId(hostname);
      }

      const cnameName = hostname;
      const cnameContent = target ?? `mock-target.local`;

          const targetRecord = await dns.ensureRecord({
            type: "CNAME",
            name: cnameName,
            content: cnameContent,
            ttl: 300,
            proxied: false,
            zoneId: providerZoneId ?? undefined,
            hostnameHint: hostname,
          });
          dnsTargetRecordId = targetRecord.id;

          const txtRecord = await dns.ensureRecord({
            type: "TXT",
            name: txtRecordFqdn(hostname),
            content: txtRecordValue(domain.verification_token),
            ttl: 300,
            proxied: false,
            zoneId: providerZoneId ?? undefined,
            hostnameHint: hostname,
          });
          dnsTxtRecordId = txtRecord.id;
          dnsStatus = "configured";
    } else {
      dnsStatus = "manual";
    }

    return {
      domainPatch: {
        status: "verifying",
        dns_provider: dnsProviderId,
        hosting_provider: hostingProviderId,
        dns_status: dnsStatus,
        hosting_status: hostingStatus,
        ssl_status: sslStatus,
        last_error: null,
        dns_target_record_id: dnsTargetRecordId,
        dns_txt_record_id: dnsTxtRecordId,
        hosting_domain_id: hostingDomainId,
        provider_zone_id: providerZoneId,
      },
      message:
        "Domain provisioning started. DNS changes can take several minutes to propagate.",
      manualFallback: dnsStatus === "manual" || hostingStatus === "manual",
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("provisionCompanyDomain", error);
    }
    return {
      domainPatch: {
        status: "failed",
        dns_status: "failed",
        last_error: safeProviderError(error),
        dns_provider: dnsProviderId,
        hosting_provider: hostingProviderId,
      },
      message: safeProviderError(error),
      manualFallback: true,
    };
  }
}

async function checkDnsTarget(hostname: string, expectedTarget: string | null) {
  if (!expectedTarget) return null;
  if (isLocalDevHostname(hostname) && process.env.NODE_ENV !== "production") {
    return true;
  }
  try {
    const cnames = await dns.resolveCname(hostname);
    return cnames.some(
      (c) =>
        c.replace(/\.$/, "").toLowerCase() ===
        expectedTarget.replace(/\.$/, "").toLowerCase(),
    );
  } catch {
    // Apex may use ALIAS — treat as unknown rather than false hard fail
    if (isApexHostname(hostname)) return null;
    return false;
  }
}

export async function checkDomainHealth(
  domain: CompanyDomain,
): Promise<DomainHealth> {
  const messages: string[] = [];
  const target = getCustomDomainTarget();
  const manualFallback =
    domain.dns_status === "manual" ||
    getConfiguredDnsProviderId() === "none";

  const ownership = await verifyDomainTxtRecord({
    normalizedDomain: domain.normalized_domain,
    verificationToken: domain.verification_token,
  });
  const ownershipVerified = ownership.ok && ownership.matched;

  const dnsTargetOk = await checkDnsTarget(
    domain.normalized_domain,
    target,
  );

  let hostingReady = domain.hosting_status === "ready" || domain.hosting_status === "manual";
  let sslReady = domain.ssl_status === "ready" || domain.ssl_status === "unknown";

  try {
    const hosting = createHostingProvider();
    if (hosting) {
      const status = await hosting.getDomainStatus(domain.normalized_domain);
      if (status) {
        hostingReady = status.configured && (status.verified || status.sslReady);
        sslReady = status.sslReady;
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("hosting status check", error);
    }
    messages.push("Hosting status could not be confirmed yet.");
  }

  const dnsConfigured =
    domain.dns_status === "configured" ||
    domain.dns_status === "manual" ||
    ownershipVerified;

  if (!ownershipVerified) {
    messages.push(
      "We couldn't find the verification record yet. DNS changes can take several minutes to propagate.",
    );
  }
  if (dnsTargetOk === false) {
    messages.push("DNS target record is not pointing to the application yet.");
  }

  const canActivate =
    ownershipVerified &&
    (dnsTargetOk === true || dnsTargetOk === null || manualFallback) &&
    (hostingReady || manualFallback || getConfiguredHostingProviderId() === "none");

  const steps = [
    {
      id: "validate",
      label: "Domain validated",
      done: true,
    },
    {
      id: "hosting",
      label: "Hosting configured",
      done: hostingReady || domain.hosting_status === "configured",
      active: !hostingReady && domain.status === "provisioning",
    },
    {
      id: "dns",
      label: "DNS configured",
      done: dnsConfigured,
      active: domain.status === "provisioning",
    },
    {
      id: "ownership",
      label: "Ownership verified",
      done: ownershipVerified,
      active: domain.status === "verifying",
    },
    {
      id: "ssl",
      label: "SSL ready",
      done: sslReady || (canActivate && manualFallback),
      active: ownershipVerified && !sslReady,
    },
  ];

  return {
    dnsConfigured,
    dnsTargetOk,
    ownershipVerified,
    hostingReady,
    sslReady,
    canActivate,
    manualFallback,
    messages,
    steps,
  };
}

export async function cleanupProvisionedRecords(domain: CompanyDomain) {
  const zoneOpts = domain.provider_zone_id
    ? { zoneId: domain.provider_zone_id }
    : undefined;
  try {
    const dns = createDnsProvider();
    if (dns && domain.dns_txt_record_id) {
      await dns.deleteRecord(domain.dns_txt_record_id, zoneOpts);
    }
    if (dns && domain.dns_target_record_id) {
      await dns.deleteRecord(domain.dns_target_record_id, zoneOpts);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("DNS cleanup", error);
    }
  }

  try {
    const hosting = createHostingProvider();
    if (hosting) {
      await hosting.removeDomain(domain.normalized_domain);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Hosting cleanup", error);
    }
  }
}

export function getCompanyPrimaryUrl(options: {
  primaryDomain?: string | null;
  platformOrigin?: string | null;
}): string {
  if (options.primaryDomain) {
    return `https://${options.primaryDomain}`;
  }
  return (
    options.platformOrigin ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}
