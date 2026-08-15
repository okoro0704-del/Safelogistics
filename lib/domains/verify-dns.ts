import { promises as dns } from "dns";

import {
  isLocalDevHostname,
  legacyTxtRecordName,
  legacyTxtRecordValue,
  txtRecordFqdn,
  txtRecordName,
  txtRecordValue,
} from "@/lib/domains/normalize";

export type DnsVerificationResult =
  | { ok: true; matched: true }
  | { ok: true; matched: false; reason: "not_found" }
  | { ok: false; reason: "lookup_failed"; message: string };

/**
 * Server-side TXT verification for custom domains.
 * Accepts current Parcel Movement records and legacy RouteLedger labels.
 */
export async function verifyDomainTxtRecord(options: {
  normalizedDomain: string;
  verificationToken: string;
}): Promise<DnsVerificationResult> {
  const expected = [
    txtRecordValue(options.verificationToken),
    legacyTxtRecordValue(options.verificationToken),
  ];
  const hosts = [
    txtRecordFqdn(options.normalizedDomain),
    `${legacyTxtRecordName()}.${options.normalizedDomain}`,
  ];

  const allowLocal =
    process.env.DOMAIN_ALLOW_LOCALHOST_VERIFY !== "false" &&
    process.env.NODE_ENV === "development" &&
    isLocalDevHostname(options.normalizedDomain);

  if (allowLocal) {
    return { ok: true, matched: true };
  }

  let sawLookupFailure = false;

  for (const fqdn of hosts) {
    try {
      const records = await dns.resolveTxt(fqdn);
      const flattened = records.map((parts) => parts.join(""));
      const matched = flattened.some((value) =>
        expected.some(
          (token) => value.trim() === token || value.includes(token),
        ),
      );
      if (matched) {
        return { ok: true, matched: true };
      }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "ENODATA" || code === "ENOTFOUND" || code === "ENAMEERR") {
        continue;
      }
      sawLookupFailure = true;
    }
  }

  if (sawLookupFailure) {
    return {
      ok: false,
      reason: "lookup_failed",
      message: "DNS lookup failed",
    };
  }

  return { ok: true, matched: false, reason: "not_found" };
}

// Keep exports referenced for call sites that import names
void txtRecordName;
