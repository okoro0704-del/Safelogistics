import {
  DnsProviderError,
  withTimeout,
  type DnsProvider,
  type DnsRecord,
  type DnsRecordInput,
  type DnsRecordType,
} from "@/lib/domains/providers/dns/types";

type CloudflareConfig = {
  apiToken: string;
  zoneId?: string;
};

/**
 * Cloudflare DNS via REST API (no SDK dependency).
 * Required token permissions: Zone → DNS → Edit (scoped to zone).
 *
 * Apex domains use CNAME (Cloudflare CNAME flattening) when CUSTOM_DOMAIN_TARGET
 * is a hostname. Do not assume all DNS providers support apex CNAME.
 */
export class CloudflareDnsProvider implements DnsProvider {
  readonly id = "cloudflare";
  private zoneCache = new Map<string, string>();

  constructor(private readonly config: CloudflareConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await withTimeout(
      fetch(`https://api.cloudflare.com/client/v4${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      }),
      15_000,
      "Cloudflare",
    );

    const json = (await response.json()) as {
      success: boolean;
      errors?: Array<{ message?: string; code?: number }>;
      result?: T;
    };

    if (!response.ok || !json.success) {
      const message = json.errors?.[0]?.message ?? "Cloudflare request failed";
      if (response.status === 401 || response.status === 403) {
        throw new DnsProviderError(message, "auth");
      }
      throw new DnsProviderError(message, "upstream");
    }

    return json.result as T;
  }

  async resolveZoneId(hostname: string): Promise<string> {
    if (this.config.zoneId) return this.config.zoneId;
    const cached = this.zoneCache.get(hostname);
    if (cached) return cached;

    const parts = hostname.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join(".");
      const zones = await this.request<Array<{ id: string; name: string }>>(
        `/zones?name=${encodeURIComponent(candidate)}&status=active`,
      );
      if (zones?.[0]?.id) {
        this.zoneCache.set(hostname, zones[0].id);
        return zones[0].id;
      }
    }

    throw new DnsProviderError(
      "No Cloudflare zone found for this domain",
      "not_found",
    );
  }

  async ensureRecord(
    input: DnsRecordInput & { zoneId?: string; hostnameHint?: string },
  ): Promise<DnsRecord> {
    const hint = input.hostnameHint ?? input.name;
    const zoneId = input.zoneId ?? (await this.resolveZoneId(hint));

    const existing = await this.findRecords({
      type: input.type,
      name: input.name,
      zoneId,
    });

    const match = existing.find((r) => r.content === input.content);
    if (match) return { ...match, /* zone tracked by caller */ };

    const body = {
      type: input.type,
      name: input.name,
      content: input.content,
      ttl: input.ttl ?? 300,
      proxied: input.type === "TXT" ? false : Boolean(input.proxied),
    };

    if (existing[0]) {
      const updated = await this.request<{
        id: string;
        type: DnsRecordType;
        name: string;
        content: string;
        ttl: number;
        proxied?: boolean;
      }>(`/zones/${zoneId}/dns_records/${existing[0].id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return {
        id: updated.id,
        type: updated.type,
        name: updated.name,
        content: updated.content,
        ttl: updated.ttl,
        proxied: updated.proxied,
      };
    }

    const created = await this.request<{
      id: string;
      type: DnsRecordType;
      name: string;
      content: string;
      ttl: number;
      proxied?: boolean;
    }>(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      id: created.id,
      type: created.type,
      name: created.name,
      content: created.content,
      ttl: created.ttl,
      proxied: created.proxied,
    };
  }

  async deleteRecord(
    recordId: string,
    options?: { zoneId?: string },
  ): Promise<void> {
    const zid = options?.zoneId ?? this.config.zoneId;
    if (!zid) {
      throw new DnsProviderError(
        "Zone id required to delete DNS record",
        "upstream",
      );
    }
    await this.request(`/zones/${zid}/dns_records/${recordId}`, {
      method: "DELETE",
    });
  }

  async findRecords(filter: {
    type?: DnsRecordType;
    name: string;
    zoneId?: string;
  }): Promise<DnsRecord[]> {
    const zoneId =
      filter.zoneId ??
      this.config.zoneId ??
      (await this.resolveZoneId(filter.name));
    const params = new URLSearchParams();
    if (filter.type) params.set("type", filter.type);
    params.set("name", filter.name);

    const rows = await this.request<
      Array<{
        id: string;
        type: DnsRecordType;
        name: string;
        content: string;
        ttl: number;
        proxied?: boolean;
      }>
    >(`/zones/${zoneId}/dns_records?${params.toString()}`);

    return (rows ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      content: r.content,
      ttl: r.ttl,
      proxied: r.proxied,
    }));
  }
}

export function createCloudflareDnsProviderFromEnv(): CloudflareDnsProvider {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!apiToken) {
    throw new DnsProviderError("Cloudflare is not configured", "not_configured");
  }
  return new CloudflareDnsProvider({
    apiToken,
    zoneId: process.env.CLOUDFLARE_ZONE_ID?.trim() || undefined,
  });
}
