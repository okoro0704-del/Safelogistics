import { createResendMailProviderFromEnv } from "@/lib/email/providers/resend";
import {
  MailProviderError,
  type MailProvider,
} from "@/lib/email/providers/types";

export type MailProviderId = "resend" | "none";

export function getConfiguredMailProviderId(): MailProviderId {
  const raw = (process.env.MAIL_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    return process.env.RESEND_API_KEY?.trim() ? "resend" : "none";
  }
  if (raw === "resend" || raw === "none") return raw;
  return "none";
}

export function createMailProvider(): MailProvider | null {
  const id = getConfiguredMailProviderId();
  if (id === "none") return null;
  if (id === "resend") return createResendMailProviderFromEnv();
  return null;
}

export function requireMailProvider(): MailProvider {
  const provider = createMailProvider();
  if (!provider) {
    throw new MailProviderError("Mail provider is not configured", "not_configured");
  }
  return provider;
}

export type {
  MailDnsRecord,
  MailDomainStatus,
  MailProvider,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/providers/types";
export { MailProviderError } from "@/lib/email/providers/types";
