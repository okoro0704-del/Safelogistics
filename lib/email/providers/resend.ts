import { Resend } from "resend";

import {
  MailProviderError,
  type MailDnsRecord,
  type MailDomainStatus,
  type MailProvider,
  type SendEmailInput,
  type SendEmailResult,
} from "@/lib/email/providers/types";

function mapStatus(raw: string | null | undefined): MailDomainStatus["status"] {
  const value = (raw ?? "").toLowerCase();
  if (value === "verified" || value === "success") return "verified";
  if (value === "failed" || value === "temporary_failure") return "failed";
  return "pending";
}

function mapRecords(records: unknown): MailDnsRecord[] {
  if (!Array.isArray(records)) return [];
  const out: MailDnsRecord[] = [];
  for (const row of records) {
    const r = row as Record<string, unknown>;
    const type = String(r.record ?? r.type ?? "TXT").toUpperCase();
    if (type !== "MX" && type !== "TXT" && type !== "CNAME") continue;
    out.push({
      type,
      name: String(r.name ?? r.host ?? "@"),
      value: String(r.value ?? r.content ?? ""),
      priority:
        typeof r.priority === "number"
          ? r.priority
          : Number(r.priority ?? NaN) || undefined,
      ttl: typeof r.ttl === "number" ? r.ttl : undefined,
    });
  }
  return out;
}

export class ResendMailProvider implements MailProvider {
  readonly id = "resend";
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async createDomain(domain: string): Promise<MailDomainStatus> {
    const { data, error } = await this.client.domains.create({ name: domain });
    if (error || !data) {
      throw new MailProviderError(
        error?.message ?? "Unable to create Resend domain",
        "upstream",
      );
    }
    return {
      id: data.id,
      name: data.name,
      status: mapStatus(data.status),
      records: mapRecords(data.records),
    };
  }

  async getDomain(domainId: string): Promise<MailDomainStatus | null> {
    const { data, error } = await this.client.domains.get(domainId);
    if (error) {
      if (/not found/i.test(error.message)) return null;
      throw new MailProviderError(error.message, "upstream");
    }
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      status: mapStatus(data.status),
      records: mapRecords(data.records),
    };
  }

  async verifyDomain(domainId: string): Promise<MailDomainStatus> {
    const { error } = await this.client.domains.verify(domainId);
    if (error) {
      throw new MailProviderError(
        error.message ?? "Unable to verify Resend domain",
        "upstream",
      );
    }
    const fresh = await this.getDomain(domainId);
    if (!fresh) {
      throw new MailProviderError("Resend domain not found after verify", "upstream");
    }
    return fresh;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const content = input.html
      ? { html: input.html, text: input.text }
      : { text: input.text ?? "" };

    const { data, error } = await this.client.emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      ...content,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    });
    if (error || !data) {
      throw new MailProviderError(
        error?.message ?? "Unable to send email",
        "upstream",
      );
    }
    return { id: data.id };
  }
}

export function createResendMailProviderFromEnv(): ResendMailProvider {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new MailProviderError("Resend is not configured", "not_configured");
  }
  return new ResendMailProvider(key);
}
