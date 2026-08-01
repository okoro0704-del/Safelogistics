import {
  DnsProviderError,
  type DnsProvider,
} from "@/lib/domains/providers/dns/types";
import { createCloudflareDnsProviderFromEnv } from "@/lib/domains/providers/dns/cloudflare";
import { getSharedMockDnsProvider } from "@/lib/domains/providers/dns/mock";

export type DnsProviderId = "mock" | "cloudflare" | "none";

export function getConfiguredDnsProviderId(): DnsProviderId {
  const raw = (process.env.DNS_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    // Dev default: mock. Production without config: none (manual DNS).
    return process.env.NODE_ENV === "production" ? "none" : "mock";
  }
  if (raw === "mock" || raw === "cloudflare" || raw === "none") return raw;
  return "none";
}

export function createDnsProvider(): DnsProvider | null {
  const id = getConfiguredDnsProviderId();

  if (id === "none") return null;

  if (id === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new DnsProviderError(
        "Mock DNS provider cannot run in production",
        "unsupported",
      );
    }
    return getSharedMockDnsProvider();
  }

  if (id === "cloudflare") {
    return createCloudflareDnsProviderFromEnv();
  }

  return null;
}

export function getCustomDomainTarget(): string | null {
  const target = process.env.CUSTOM_DOMAIN_TARGET?.trim().toLowerCase();
  return target || null;
}

export function isApexHostname(hostname: string): boolean {
  const parts = hostname.split(".");
  // e.g. example.com → 2 labels; www.example.com → 3
  return parts.length === 2;
}
