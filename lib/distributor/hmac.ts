import { createHash, createHmac, timingSafeEqual } from "crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

export function getTenantHmacSecret(): string | null {
  const secret = process.env.TENANT_HMAC_SECRET?.trim();
  return secret || null;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function verifyDistributorSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secret: string;
  nowMs?: number;
}): { ok: true } | { ok: false; status: 401; error: string } {
  const signature = input.signatureHeader?.trim() ?? "";
  const timestampRaw = input.timestampHeader?.trim() ?? "";

  if (!signature || !timestampRaw) {
    return {
      ok: false,
      status: 401,
      error: "Missing distributor signature or timestamp.",
    };
  }

  if (!/^[0-9]+$/.test(timestampRaw)) {
    return {
      ok: false,
      status: 401,
      error: "Invalid distributor timestamp.",
    };
  }

  const timestampMs = Number(timestampRaw);
  const now = input.nowMs ?? Date.now();
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_SKEW_MS) {
    return {
      ok: false,
      status: 401,
      error: "Distributor timestamp is outside the allowed window.",
    };
  }

  const expected = hmacSha256Hex(input.secret, input.rawBody);
  if (!safeEqualHex(expected.toLowerCase(), signature.toLowerCase())) {
    return {
      ok: false,
      status: 401,
      error: "Invalid distributor signature.",
    };
  }

  return { ok: true };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
