import {
  RegistrarProviderError,
  type DnsHostRecord,
  type DomainAvailability,
  type RegistrarContact,
  type RegistrarProvider,
  type RegisterDomainResult,
} from "@/lib/domains/providers/registrar/types";

/** In-memory mock for local development without Namecheap credentials. */
export class MockRegistrarProvider implements RegistrarProvider {
  readonly id = "mock";
  private hosts = new Map<string, DnsHostRecord[]>();
  private registered = new Set<string>();

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    return domains.map((domain) => {
      const d = domain.toLowerCase();
      const taken = this.registered.has(d) || d.startsWith("taken-");
      return {
        domain: d,
        available: !taken,
        premium: false,
        priceCents: 1299,
        currency: "USD",
      };
    });
  }

  async getPricing(): Promise<{ priceCents: number; currency: string } | null> {
    return { priceCents: 1299, currency: "USD" };
  }

  async register(input: {
    domain: string;
    years: number;
    contact: RegistrarContact;
  }): Promise<RegisterDomainResult> {
    const domain = input.domain.toLowerCase();
    if (domain.startsWith("taken-")) {
      throw new RegistrarProviderError("Domain unavailable", "unavailable");
    }
    this.registered.add(domain);
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + input.years);
    return {
      domain,
      orderId: `mock-${Date.now()}`,
      registered: true,
      chargedAmount: 1299,
      expiresAt: expires.toISOString(),
    };
  }

  async getDnsHosts(domain: string): Promise<DnsHostRecord[]> {
    return this.hosts.get(domain.toLowerCase()) ?? [];
  }

  async setDnsHosts(domain: string, hosts: DnsHostRecord[]): Promise<void> {
    this.hosts.set(domain.toLowerCase(), hosts);
  }
}

let shared: MockRegistrarProvider | null = null;

export function getSharedMockRegistrarProvider() {
  if (!shared) shared = new MockRegistrarProvider();
  return shared;
}
