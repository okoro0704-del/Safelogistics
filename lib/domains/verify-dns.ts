import { promises as dns } from "dns";

import {
  isLocalDevHostname,
  txtRecordFqdn,
  txtRecordValue,
} from "@/lib/domains/normalize";

export type DnsVerificationResult =
  | { ok: true; matched: true }
  | { ok: true; matched: false; reason: "not_found" }
  | { ok: false; reason: "lookup_failed"; message: string };

/**
 * Server-side TXT verification for custom domains.
 * Looks for routeledger-verification=<token> among TXT records at
 * _routeledger.<domain>.
 */
export async function verifyDomainTxtRecord(options: {
  normalizedDomain: string;
  verificationToken: string;
}): Promise<DnsVerificationResult> {
  const expected = txtRecordValue(options.verificationToken);
  const fqdn = txtRecordFqdn(options.normalizedDomain);

  // Local development: *.localhost cannot use public DNS — allow verify when
  // DOMAIN_ALLOW_LOCALHOST_VERIFY is not explicitly false.
  const allowLocal =
    process.env.DOMAIN_ALLOW_LOCALHOST_VERIFY !== "false" &&
    process.env.NODE_ENV === "development" &&
    isLocalDevHostname(options.normalizedDomain);

  if (allowLocal) {
    return { ok: true, matched: true };
  }

  try {
    const records = await dns.resolveTxt(fqdn);
    const flattened = records.map((parts) => parts.join(""));
    const matched = flattened.some(
      (value) => value.trim() === expected || value.includes(expected),
    );
    if (matched) {
      return { ok: true, matched: true };
    }
    return { ok: true, matched: false, reason: "not_found" };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ENODATA" || code === "ENOTFOUND" || code === "ENAMEERR") {
      return { ok: true, matched: false, reason: "not_found" };
    }
    return {
      ok: false,
      reason: "lookup_failed",
      message: "DNS lookup failed",
    };
  }
}
