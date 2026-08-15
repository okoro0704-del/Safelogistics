/**
 * DNS provider abstraction — application code must not call Cloudflare/Route53 directly.
 */

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT";

export type DnsRecord = {
  id: string;
  type: DnsRecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
};

export type DnsRecordInput = {
  type: DnsRecordType;
  /** Relative name (e.g. _parcelmovement or @) or FQDN */
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  /** Cloudflare zone override */
  zoneId?: string;
  hostnameHint?: string;
};

export class DnsProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "auth"
      | "timeout"
      | "conflict"
      | "not_found"
      | "upstream"
      | "unsupported" = "upstream",
  ) {
    super(message);
    this.name = "DnsProviderError";
  }
}

export interface DnsProvider {
  readonly id: string;
  /** Ensure record exists (idempotent). Returns provider record id. */
  ensureRecord(input: DnsRecordInput): Promise<DnsRecord>;
  deleteRecord(
    recordId: string,
    options?: { zoneId?: string },
  ): Promise<void>;
  findRecords(filter: {
    type?: DnsRecordType;
    name: string;
  }): Promise<DnsRecord[]>;
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "DNS provider",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DnsProviderError(`${label} timed out`, "timeout"));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
