/**
 * Registrar provider abstraction — Namecheap domain purchase / DNS hosts.
 */

export type DomainAvailability = {
  domain: string;
  available: boolean;
  premium?: boolean;
  /** Registration price in USD cents when known */
  priceCents?: number | null;
  currency?: string;
  error?: string | null;
};

export type RegistrarContact = {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  phone: string;
  emailAddress: string;
  organizationName?: string;
  address2?: string;
};

export type DnsHostRecord = {
  hostName: string;
  recordType: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "URL" | "FRAME" | "NS";
  address: string;
  ttl?: number;
  mxPref?: number;
};

export type RegisterDomainResult = {
  domain: string;
  orderId: string | null;
  registered: boolean;
  chargedAmount?: number | null;
  expiresAt?: string | null;
  raw?: unknown;
};

export class RegistrarProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "auth"
      | "timeout"
      | "upstream"
      | "unavailable"
      | "unsupported" = "upstream",
  ) {
    super(message);
    this.name = "RegistrarProviderError";
  }
}

export interface RegistrarProvider {
  readonly id: string;
  checkAvailability(domains: string[]): Promise<DomainAvailability[]>;
  getPricing(domain: string): Promise<{ priceCents: number; currency: string } | null>;
  register(input: {
    domain: string;
    years: number;
    contact: RegistrarContact;
  }): Promise<RegisterDomainResult>;
  getDnsHosts(domain: string): Promise<DnsHostRecord[]>;
  setDnsHosts(domain: string, hosts: DnsHostRecord[]): Promise<void>;
}
