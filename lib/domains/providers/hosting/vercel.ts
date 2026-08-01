import {
  HostingProviderError,
  type HostingDomainStatus,
  type HostingProvider,
} from "@/lib/domains/providers/hosting/types";
import { withTimeout } from "@/lib/domains/providers/dns/types";

type VercelConfig = {
  token: string;
  projectId: string;
  teamId?: string;
};

/**
 * Vercel Domains API — attaches custom domains to the Next.js project.
 * SSL is managed by Vercel.
 */
export class VercelHostingProvider implements HostingProvider {
  readonly id = "vercel";

  constructor(private readonly config: VercelConfig) {}

  private url(path: string) {
    const base = `https://api.vercel.com${path}`;
    if (!this.config.teamId) return base;
    const sep = path.includes("?") ? "&" : "?";
    return `${base}${sep}teamId=${encodeURIComponent(this.config.teamId)}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await withTimeout(
      fetch(this.url(path), {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      }),
      15_000,
      "Vercel",
    );

    if (response.status === 404) {
      return null as T;
    }

    const json = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      const message =
        typeof json.error === "object" &&
        json.error &&
        "message" in json.error
          ? String((json.error as { message?: string }).message)
          : "Vercel request failed";
      if (response.status === 401 || response.status === 403) {
        throw new HostingProviderError(message, "auth");
      }
      // Domain already exists — treat as success path via get
      if (response.status === 409) {
        throw new HostingProviderError(message, "upstream");
      }
      throw new HostingProviderError(message, "upstream");
    }

    return json as T;
  }

  async addDomain(hostname: string): Promise<HostingDomainStatus> {
    try {
      await this.request(`/v10/projects/${this.config.projectId}/domains`, {
        method: "POST",
        body: JSON.stringify({ name: hostname }),
      });
    } catch (error) {
      // Idempotent: if already added, continue to status
      if (
        !(error instanceof HostingProviderError) ||
        !/already|exist/i.test(error.message)
      ) {
        // Try status anyway for 409-style messages
        const existing = await this.getDomainStatus(hostname);
        if (existing?.configured) return existing;
        throw error;
      }
    }

    const status = await this.getDomainStatus(hostname);
    if (!status) {
      return {
        hostname,
        configured: true,
        verified: false,
        sslReady: false,
        providerDomainId: hostname,
      };
    }
    return status;
  }

  async removeDomain(hostname: string): Promise<void> {
    await this.request(
      `/v9/projects/${this.config.projectId}/domains/${encodeURIComponent(hostname)}`,
      { method: "DELETE" },
    );
  }

  async getDomainStatus(hostname: string): Promise<HostingDomainStatus | null> {
    const data = await this.request<{
      name?: string;
      verified?: boolean;
      verification?: unknown;
    } | null>(
      `/v9/projects/${this.config.projectId}/domains/${encodeURIComponent(hostname)}`,
    );

    if (!data) return null;

    // SSL readiness: Vercel typically serves once verified
    const verified = Boolean(data.verified);
    return {
      hostname: data.name ?? hostname,
      configured: true,
      verified,
      sslReady: verified,
      providerDomainId: data.name ?? hostname,
    };
  }
}

export function createVercelHostingProviderFromEnv(): VercelHostingProvider {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) {
    throw new HostingProviderError("Vercel hosting is not configured", "not_configured");
  }
  return new VercelHostingProvider({
    token,
    projectId,
    teamId: process.env.VERCEL_TEAM_ID?.trim() || undefined,
  });
}
