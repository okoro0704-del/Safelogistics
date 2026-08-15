import { withTimeout } from "@/lib/domains/providers/dns/types";
import {
  HostingProviderError,
  type HostingDomainStatus,
  type HostingProvider,
} from "@/lib/domains/providers/hosting/types";

type NetlifyConfig = {
  token: string;
  siteId: string;
};

/**
 * Netlify Domains API — attaches custom domains to the deployed site.
 * SSL is managed by Netlify once DNS points correctly.
 */
export class NetlifyHostingProvider implements HostingProvider {
  readonly id = "netlify";

  constructor(private readonly config: NetlifyConfig) {}

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<{ status: number; data: T }> {
    const response = await withTimeout(
      fetch(`https://api.netlify.com/api/v1${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      }),
      20_000,
      "Netlify",
    );

    const text = await response.text();
    let data = null as T;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = text as unknown as T;
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new HostingProviderError("Netlify authentication failed", "auth");
    }

    if (!response.ok && response.status !== 404) {
      const message =
        typeof data === "object" &&
        data &&
        "message" in data &&
        typeof (data as { message?: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Netlify request failed (${response.status})`;
      throw new HostingProviderError(message, "upstream");
    }

    return { status: response.status, data };
  }

  async addDomain(hostname: string): Promise<HostingDomainStatus> {
    try {
      await this.request(`/sites/${this.config.siteId}/domains`, {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
    } catch (error) {
      if (
        error instanceof HostingProviderError &&
        /already|exist/i.test(error.message)
      ) {
        // continue to status
      } else {
        const existing = await this.getDomainStatus(hostname);
        if (existing?.configured) return existing;
        throw error;
      }
    }

    const status = await this.getDomainStatus(hostname);
    return (
      status ?? {
        hostname,
        configured: true,
        verified: false,
        sslReady: false,
        providerDomainId: hostname,
      }
    );
  }

  async removeDomain(hostname: string): Promise<void> {
    await this.request(
      `/sites/${this.config.siteId}/domains/${encodeURIComponent(hostname)}`,
      { method: "DELETE" },
    );
  }

  async getDomainStatus(hostname: string): Promise<HostingDomainStatus | null> {
    const { status, data } = await this.request<{
      id?: string;
      name?: string;
      hostname?: string;
      ssl?: boolean | null;
      ssl_url?: string | null;
      verified?: boolean | null;
      dns_zone_id?: string | null;
    } | null>(
      `/sites/${this.config.siteId}/domains/${encodeURIComponent(hostname)}`,
    );

    if (status === 404 || !data) {
      // Fallback: list domains
      const listed = await this.request<
        Array<{
          id?: string;
          name?: string;
          hostname?: string;
          ssl?: boolean | null;
        }>
      >(`/sites/${this.config.siteId}/domains`);
      const match = (Array.isArray(listed.data) ? listed.data : []).find(
        (d) =>
          (d.name ?? d.hostname ?? "").toLowerCase() === hostname.toLowerCase(),
      );
      if (!match) return null;
      return {
        hostname: match.name ?? match.hostname ?? hostname,
        configured: true,
        verified: Boolean(match.ssl),
        sslReady: Boolean(match.ssl),
        providerDomainId: match.id ?? match.name ?? hostname,
      };
    }

    const name = data.name ?? data.hostname ?? hostname;
    const sslReady = Boolean(data.ssl || data.ssl_url);
    const verified = data.verified == null ? sslReady : Boolean(data.verified);

    return {
      hostname: name,
      configured: true,
      verified,
      sslReady,
      providerDomainId: data.id ?? name,
    };
  }
}

export function createNetlifyHostingProviderFromEnv(): NetlifyHostingProvider {
  const token = process.env.NETLIFY_AUTH_TOKEN?.trim();
  const siteId = process.env.NETLIFY_SITE_ID?.trim();
  if (!token || !siteId) {
    throw new HostingProviderError(
      "Netlify hosting is not configured",
      "not_configured",
    );
  }
  return new NetlifyHostingProvider({ token, siteId });
}
