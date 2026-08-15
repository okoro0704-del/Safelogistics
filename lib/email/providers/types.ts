export type MailDnsRecord = {
  type: "MX" | "TXT" | "CNAME";
  name: string;
  value: string;
  priority?: number;
  ttl?: number;
};

export type MailDomainStatus = {
  id: string;
  name: string;
  status: "pending" | "verified" | "failed";
  records: MailDnsRecord[];
};

export type SendEmailInput = {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type SendEmailResult = {
  id: string;
};

export class MailProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "auth"
      | "upstream"
      | "timeout" = "upstream",
  ) {
    super(message);
    this.name = "MailProviderError";
  }
}

export interface MailProvider {
  readonly id: string;
  createDomain(domain: string): Promise<MailDomainStatus>;
  getDomain(domainId: string): Promise<MailDomainStatus | null>;
  verifyDomain(domainId: string): Promise<MailDomainStatus>;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
