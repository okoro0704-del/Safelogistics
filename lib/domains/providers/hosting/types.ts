export type HostingDomainStatus = {
  hostname: string;
  configured: boolean;
  verified: boolean;
  sslReady: boolean;
  providerDomainId?: string | null;
};

export class HostingProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "auth"
      | "timeout"
      | "upstream"
      | "unsupported" = "upstream",
  ) {
    super(message);
    this.name = "HostingProviderError";
  }
}

export interface HostingProvider {
  readonly id: string;
  addDomain(hostname: string): Promise<HostingDomainStatus>;
  removeDomain(hostname: string): Promise<void>;
  getDomainStatus(hostname: string): Promise<HostingDomainStatus | null>;
}
