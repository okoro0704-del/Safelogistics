import type {
  HostingDomainStatus,
  HostingProvider,
} from "@/lib/domains/providers/hosting/types";

export class MockHostingProvider implements HostingProvider {
  readonly id = "mock";
  private domains = new Map<string, HostingDomainStatus>();

  async addDomain(hostname: string): Promise<HostingDomainStatus> {
    const existing = this.domains.get(hostname);
    if (existing) return existing;
    const status: HostingDomainStatus = {
      hostname,
      configured: true,
      verified: true,
      sslReady: true,
      providerDomainId: `mock-host-${hostname}`,
    };
    this.domains.set(hostname, status);
    return status;
  }

  async removeDomain(hostname: string): Promise<void> {
    this.domains.delete(hostname);
  }

  async getDomainStatus(hostname: string): Promise<HostingDomainStatus | null> {
    return this.domains.get(hostname) ?? null;
  }
}

let shared: MockHostingProvider | null = null;
export function getSharedMockHostingProvider() {
  if (!shared) shared = new MockHostingProvider();
  return shared;
}
