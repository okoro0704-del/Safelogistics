import { withTimeout } from "@/lib/domains/providers/dns/types";
import {
  RegistrarProviderError,
  type DnsHostRecord,
  type DomainAvailability,
  type RegistrarContact,
  type RegistrarProvider,
  type RegisterDomainResult,
} from "@/lib/domains/providers/registrar/types";

type NamecheapConfig = {
  apiUser: string;
  apiKey: string;
  userName: string;
  clientIp: string;
  sandbox: boolean;
};

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  const match = tag.match(re);
  return match?.[1] ?? null;
}

function findTags(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*?/?>`, "gi");
  return xml.match(re) ?? [];
}

function apiStatus(xml: string): { ok: boolean; error: string | null } {
  const statusMatch = xml.match(/<ApiResponse[^>]*Status="([^"]+)"/i);
  const status = statusMatch?.[1] ?? "";
  if (status.toUpperCase() === "OK") return { ok: true, error: null };
  const errMatch = xml.match(/<Error[^>]*>([^<]+)<\/Error>/i);
  return { ok: false, error: errMatch?.[1]?.trim() || "Namecheap API error" };
}

function dollarsToCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export class NamecheapRegistrarProvider implements RegistrarProvider {
  readonly id = "namecheap";

  constructor(private readonly config: NamecheapConfig) {}

  private baseUrl() {
    return this.config.sandbox
      ? "https://api.sandbox.namecheap.com/xml.response"
      : "https://api.namecheap.com/xml.response";
  }

  private async call(command: string, params: Record<string, string>): Promise<string> {
    const url = new URL(this.baseUrl());
    url.searchParams.set("ApiUser", this.config.apiUser);
    url.searchParams.set("ApiKey", this.config.apiKey);
    url.searchParams.set("UserName", this.config.userName);
    url.searchParams.set("ClientIp", this.config.clientIp);
    url.searchParams.set("Command", command);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await withTimeout(
      fetch(url.toString(), { method: "GET" }),
      30_000,
      "Namecheap",
    );
    const xml = await response.text();
    if (!response.ok) {
      throw new RegistrarProviderError(
        `Namecheap HTTP ${response.status}`,
        response.status === 401 || response.status === 403 ? "auth" : "upstream",
      );
    }
    const status = apiStatus(xml);
    if (!status.ok) {
      const msg = status.error ?? "Namecheap request failed";
      if (/auth|key|ip/i.test(msg)) {
        throw new RegistrarProviderError(msg, "auth");
      }
      throw new RegistrarProviderError(msg, "upstream");
    }
    return xml;
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const list = domains
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
    if (list.length === 0) return [];

    const xml = await this.call("namecheap.domains.check", {
      DomainList: list.join(","),
    });

    return findTags(xml, "DomainCheckResult").map((tag) => {
      const domain = (attr(tag, "Domain") ?? "").toLowerCase();
      const available = (attr(tag, "Available") ?? "").toLowerCase() === "true";
      const premium = (attr(tag, "IsPremiumName") ?? "").toLowerCase() === "true";
      const price =
        dollarsToCents(attr(tag, "PremiumRegistrationPrice")) ??
        dollarsToCents(attr(tag, "RegistrationPrice"));
      return {
        domain,
        available,
        premium,
        priceCents: price,
        currency: "USD",
        error: attr(tag, "ErrorNo") && attr(tag, "ErrorNo") !== "0"
          ? attr(tag, "Description")
          : null,
      };
    });
  }

  async getPricing(
    domain: string,
  ): Promise<{ priceCents: number; currency: string } | null> {
    const parts = domain.toLowerCase().split(".");
    const tld = parts.slice(1).join(".");
    if (!tld) return null;

    try {
      const xml = await this.call("namecheap.users.getPricing", {
        ProductType: "DOMAIN",
        ProductCategory: "REGISTER",
        ProductName: tld,
        ActionName: "REGISTER",
      });
      const priceMatch = xml.match(/Price="([^"]+)"/i);
      const cents = dollarsToCents(priceMatch?.[1]);
      if (cents == null) return null;
      return { priceCents: cents, currency: "USD" };
    } catch {
      return null;
    }
  }

  private contactParams(contact: RegistrarContact): Record<string, string> {
    const base = {
      FirstName: contact.firstName,
      LastName: contact.lastName,
      Address1: contact.address1,
      Address2: contact.address2 ?? "",
      City: contact.city,
      StateProvince: contact.stateProvince,
      PostalCode: contact.postalCode,
      Country: contact.country,
      Phone: contact.phone,
      EmailAddress: contact.emailAddress,
      OrganizationName: contact.organizationName ?? "",
    };
    const roles = ["Registrant", "Tech", "Admin", "AuxBilling"] as const;
    const out: Record<string, string> = {};
    for (const role of roles) {
      for (const [key, value] of Object.entries(base)) {
        out[`${role}${key}`] = value;
      }
    }
    return out;
  }

  async register(input: {
    domain: string;
    years: number;
    contact: RegistrarContact;
  }): Promise<RegisterDomainResult> {
    const domain = input.domain.trim().toLowerCase();
    const years = Math.max(1, Math.min(10, input.years || 1));
    const xml = await this.call("namecheap.domains.create", {
      DomainName: domain,
      Years: String(years),
      AddFreeWhoisguard: "yes",
      WGEnabled: "yes",
      ...this.contactParams(input.contact),
    });

    const resultTag = findTags(xml, "DomainCreateResult")[0] ?? "";
    const registered =
      (attr(resultTag, "Registered") ?? "").toLowerCase() === "true";
    const orderId = attr(resultTag, "OrderID") ?? attr(resultTag, "TransactionID");
    const charged = dollarsToCents(attr(resultTag, "ChargedAmount"));

    if (!registered) {
      throw new RegistrarProviderError(
        `Domain ${domain} was not registered`,
        "unavailable",
      );
    }

    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + years);

    return {
      domain,
      orderId,
      registered: true,
      chargedAmount: charged,
      expiresAt: expires.toISOString(),
    };
  }

  async getDnsHosts(domain: string): Promise<DnsHostRecord[]> {
    const sldTld = splitSldTld(domain);
    const xml = await this.call("namecheap.domains.dns.getHosts", sldTld);
    return findTags(xml, "host").map((tag) => ({
      hostName: attr(tag, "Name") ?? "@",
      recordType: (attr(tag, "Type") ?? "TXT") as DnsHostRecord["recordType"],
      address: attr(tag, "Address") ?? "",
      ttl: Number(attr(tag, "TTL") ?? 300) || 300,
      mxPref: Number(attr(tag, "MXPref") ?? 10) || 10,
    }));
  }

  async setDnsHosts(domain: string, hosts: DnsHostRecord[]): Promise<void> {
    const sldTld = splitSldTld(domain);
    const params: Record<string, string> = { ...sldTld };
    hosts.forEach((host, index) => {
      const i = index + 1;
      params[`HostName${i}`] = host.hostName;
      params[`RecordType${i}`] = host.recordType;
      params[`Address${i}`] = host.address;
      params[`TTL${i}`] = String(host.ttl ?? 300);
      if (host.recordType === "MX") {
        params[`MXPref${i}`] = String(host.mxPref ?? 10);
      }
    });
    await this.call("namecheap.domains.dns.setHosts", params);
  }
}

function splitSldTld(domain: string): { SLD: string; TLD: string } {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2) {
    throw new RegistrarProviderError("Invalid domain for DNS", "upstream");
  }
  // multi-part TLD like co.uk — Namecheap expects last labels as TLD
  if (parts.length > 2 && ["co", "com", "net", "org", "uk", "au"].includes(parts[parts.length - 2]!)) {
    return {
      SLD: parts.slice(0, -2).join("."),
      TLD: parts.slice(-2).join("."),
    };
  }
  return {
    SLD: parts[0]!,
    TLD: parts.slice(1).join("."),
  };
}

export function getNamecheapContactFromEnv(): RegistrarContact | null {
  const firstName = process.env.NAMECHEAP_CONTACT_FIRST_NAME?.trim();
  const lastName = process.env.NAMECHEAP_CONTACT_LAST_NAME?.trim();
  const address1 = process.env.NAMECHEAP_CONTACT_ADDRESS1?.trim();
  const city = process.env.NAMECHEAP_CONTACT_CITY?.trim();
  const stateProvince = process.env.NAMECHEAP_CONTACT_STATE?.trim();
  const postalCode = process.env.NAMECHEAP_CONTACT_POSTAL?.trim();
  const country = process.env.NAMECHEAP_CONTACT_COUNTRY?.trim();
  const phone = process.env.NAMECHEAP_CONTACT_PHONE?.trim();
  const emailAddress = process.env.NAMECHEAP_CONTACT_EMAIL?.trim();
  if (
    !firstName ||
    !lastName ||
    !address1 ||
    !city ||
    !stateProvince ||
    !postalCode ||
    !country ||
    !phone ||
    !emailAddress
  ) {
    return null;
  }
  return {
    firstName,
    lastName,
    address1,
    city,
    stateProvince,
    postalCode,
    country,
    phone,
    emailAddress,
    organizationName: process.env.NAMECHEAP_CONTACT_ORG?.trim() || undefined,
  };
}

export function createNamecheapRegistrarFromEnv(): NamecheapRegistrarProvider {
  const apiUser = process.env.NAMECHEAP_API_USER?.trim();
  const apiKey = process.env.NAMECHEAP_API_KEY?.trim();
  const userName =
    process.env.NAMECHEAP_USERNAME?.trim() || apiUser || "";
  const clientIp = process.env.NAMECHEAP_CLIENT_IP?.trim();
  if (!apiUser || !apiKey || !userName || !clientIp) {
    throw new RegistrarProviderError(
      "Namecheap is not configured",
      "not_configured",
    );
  }
  return new NamecheapRegistrarProvider({
    apiUser,
    apiKey,
    userName,
    clientIp,
    sandbox: (process.env.NAMECHEAP_SANDBOX ?? "").toLowerCase() === "true",
  });
}
