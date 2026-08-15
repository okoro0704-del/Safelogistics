import { randomBytes } from "crypto";

import {
  createRegistrarProvider,
  getNamecheapContactFromEnv,
  RegistrarProviderError,
  type DnsHostRecord,
  type RegistrarContact,
} from "@/lib/domains/providers/registrar";
import { createHostingProvider } from "@/lib/domains/providers/hosting";
import { getCustomDomainTarget, isApexHostname } from "@/lib/domains/providers/dns";
import {
  generateVerificationToken,
  isValidHostname,
  normalizeHostname,
  txtRecordName,
  txtRecordValue,
  type CompanyDomain,
} from "@/lib/domains/normalize";
import { provisionCompanyDomain } from "@/lib/domains/provision";
import { invalidateDomainCache } from "@/lib/domains/resolve-hostname";

export type PurchaseDomainInput = {
  companyId: string;
  domain: string;
  years?: number;
  recordPayment?: boolean;
  paymentMethod?: string;
  paymentReference?: string | null;
  paymentNotes?: string | null;
  contact?: Partial<RegistrarContact> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

function mergeContact(
  override?: Partial<RegistrarContact> | null,
): RegistrarContact {
  const fromEnv = getNamecheapContactFromEnv();
  const contact: RegistrarContact = {
    firstName: override?.firstName || fromEnv?.firstName || "",
    lastName: override?.lastName || fromEnv?.lastName || "",
    address1: override?.address1 || fromEnv?.address1 || "",
    city: override?.city || fromEnv?.city || "",
    stateProvince: override?.stateProvince || fromEnv?.stateProvince || "",
    postalCode: override?.postalCode || fromEnv?.postalCode || "",
    country: override?.country || fromEnv?.country || "",
    phone: override?.phone || fromEnv?.phone || "",
    emailAddress: override?.emailAddress || fromEnv?.emailAddress || "",
    organizationName:
      override?.organizationName || fromEnv?.organizationName || undefined,
    address2: override?.address2 || fromEnv?.address2 || undefined,
  };

  const missing = Object.entries(contact)
    .filter(([key, value]) => key !== "organizationName" && key !== "address2" && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new RegistrarProviderError(
      `Registrant contact incomplete (${missing.join(", ")}). Set NAMECHEAP_CONTACT_* env vars.`,
      "not_configured",
    );
  }
  return contact;
}

function buildWebDnsHosts(
  hostname: string,
  verificationToken: string,
  target: string | null,
  existing: DnsHostRecord[],
): DnsHostRecord[] {
  const keep = existing.filter((h) => {
    const name = h.hostName.toLowerCase();
    const type = h.recordType.toUpperCase();
    if (type === "TXT" && (name === txtRecordName() || name === `@`)) {
      if (h.address.includes("routeledger-verify=")) return false;
    }
    if (target && type === "CNAME") {
      if (name === "@" || name === hostname.split(".")[0]) return false;
    }
    return true;
  });

  const hosts: DnsHostRecord[] = [...keep];

  if (target) {
    if (isApexHostname(hostname)) {
      // Namecheap URL redirect / ALIAS not universal — use www CNAME + note in UI
      hosts.push({
        hostName: "www",
        recordType: "CNAME",
        address: target.replace(/\.$/, ""),
        ttl: 300,
      });
    } else {
      hosts.push({
        hostName: hostname.split(".")[0]!,
        recordType: "CNAME",
        address: target.replace(/\.$/, ""),
        ttl: 300,
      });
    }
  }

  hosts.push({
    hostName: txtRecordName(),
    recordType: "TXT",
    address: txtRecordValue(verificationToken),
    ttl: 300,
  });

  return hosts;
}

export async function purchaseCompanyDomain(input: PurchaseDomainInput) {
  const normalized = normalizeHostname(input.domain);
  if (!normalized || !isValidHostname(normalized)) {
    throw new Error(
      "Enter a valid hostname such as example.com (no https:// or path).",
    );
  }

  const registrar = createRegistrarProvider();
  if (!registrar) {
    throw new RegistrarProviderError(
      "Domain registrar is not configured.",
      "not_configured",
    );
  }

  const years = Math.max(1, Math.min(10, input.years ?? 1));
  const contact = mergeContact(input.contact);

  const availability = await registrar.checkAvailability([normalized]);
  const check = availability[0];
  if (!check?.available) {
    throw new RegistrarProviderError(
      check?.error || `${normalized} is not available for registration.`,
      "unavailable",
    );
  }

  let pricing = check.priceCents
    ? { priceCents: check.priceCents, currency: check.currency ?? "USD" }
    : await registrar.getPricing(normalized);
  if (!pricing) {
    pricing = { priceCents: 0, currency: "USD" };
  }

  const { data: order, error: orderError } = await input.supabase.rpc(
    "master_create_domain_order",
    {
      p_company_id: input.companyId,
      p_domain: normalized,
      p_years: years,
      p_cost_cents: pricing.priceCents,
      p_currency: pricing.currency,
      p_contact_snapshot: contact,
    },
  );

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Unable to create domain order.");
  }

  const orderId = (order as { id: string }).id;
  let token: string;
  try {
    token = generateVerificationToken();
  } catch {
    token = randomBytes(32).toString("hex");
  }

  try {
    const registered = await registrar.register({
      domain: normalized,
      years,
      contact,
    });

    const { data: domainRow, error: domainError } = await input.supabase.rpc(
      "master_add_company_domain",
      {
        p_company_id: input.companyId,
        p_domain: normalized,
        p_verification_token: token,
      },
    );

    if (domainError || !domainRow) {
      throw new Error(domainError?.message ?? "Unable to attach domain.");
    }

    const companyDomain = domainRow as CompanyDomain;
    const target = getCustomDomainTarget();

    try {
      const existing = await registrar.getDnsHosts(normalized);
      const hosts = buildWebDnsHosts(
        normalized,
        companyDomain.verification_token,
        target,
        existing,
      );
      await registrar.setDnsHosts(normalized, hosts);
    } catch (dnsError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Namecheap DNS after purchase", dnsError);
      }
    }

    let hostingDomainId: string | null = null;
    let hostingStatus = "pending";
    let sslStatus = "pending";
    try {
      const hosting = createHostingProvider();
      if (hosting) {
        const hostResult = await hosting.addDomain(normalized);
        hostingDomainId = hostResult.providerDomainId ?? normalized;
        hostingStatus = hostResult.configured ? "configured" : "pending";
        sslStatus = hostResult.sslReady ? "ready" : "pending";
        if (hostResult.verified) hostingStatus = "ready";
      }
    } catch (hostError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Hosting add after purchase", hostError);
      }
    }

    await input.supabase.rpc("master_set_domain_lifecycle", {
      p_domain_id: companyDomain.id,
      p_status: "verifying",
      p_dns_status: "configured",
      p_hosting_status: hostingStatus,
      p_ssl_status: sslStatus,
      p_dns_provider: registrar.id,
      p_hosting_provider: getConfiguredHostingIdSafe(),
      p_hosting_domain_id: hostingDomainId,
      p_clear_error: true,
    });

    // Best-effort: run standard provision for any remaining steps
    try {
      const refreshed = {
        ...companyDomain,
        dns_provider: registrar.id,
        hosting_provider: getConfiguredHostingIdSafe(),
        dns_status: "configured",
        hosting_status: hostingStatus,
        ssl_status: sslStatus,
        hosting_domain_id: hostingDomainId,
      } as CompanyDomain;
      await provisionCompanyDomain(refreshed);
    } catch {
      // non-fatal
    }

    let paymentId: string | null = null;
    if (input.recordPayment && pricing.priceCents > 0) {
      const { data: payment } = await input.supabase.rpc("master_record_payment", {
        p_company_id: input.companyId,
        p_amount_cents: pricing.priceCents,
        p_currency: pricing.currency,
        p_payment_method: input.paymentMethod ?? "other",
        p_payment_date: new Date().toISOString().slice(0, 10),
        p_reference:
          input.paymentReference ??
          `domain:${normalized}:${registered.orderId ?? orderId}`,
        p_notes:
          input.paymentNotes ??
          `Domain registration ${normalized} (${years} year${years === 1 ? "" : "s"})`,
      });
      paymentId = (payment as { id?: string } | null)?.id ?? null;
    }

    await input.supabase.rpc("master_complete_domain_order", {
      p_order_id: orderId,
      p_status: "purchased",
      p_namecheap_order_id: registered.orderId,
      p_company_domain_id: companyDomain.id,
      p_payment_id: paymentId,
      p_expires_at: registered.expiresAt,
    });

    invalidateDomainCache(normalized);

    const { data: finalDomain } = await input.supabase
      .from("company_domains")
      .select("*")
      .eq("id", companyDomain.id)
      .maybeSingle();

    return {
      order: {
        ...(order as object),
        status: "purchased",
        namecheap_order_id: registered.orderId,
        company_domain_id: companyDomain.id,
        payment_id: paymentId,
      },
      domain: (finalDomain as CompanyDomain) ?? companyDomain,
      message:
        "Domain purchased and attached. DNS may take several minutes; use Check Status to activate.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Domain purchase failed.";
    await input.supabase.rpc("master_complete_domain_order", {
      p_order_id: orderId,
      p_status: "failed",
      p_last_error: message,
    });
    throw error;
  }
}

function getConfiguredHostingIdSafe() {
  return (process.env.HOSTING_PROVIDER ?? "none").trim().toLowerCase() || "none";
}
