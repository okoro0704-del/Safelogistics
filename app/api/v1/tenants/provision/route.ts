import { NextResponse } from "next/server";

import {
  getTenantHmacSecret,
  isUuid,
  verifyDistributorSignature,
} from "@/lib/distributor/hmac";
import {
  parseDistributorProvisionBody,
  provisionDistributorTenant,
} from "@/lib/distributor/provision";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Webfinance master distributor → Parcel Movement tenant provision.
 * POST /api/v1/tenants/provision
 *
 * Auth: HMAC-SHA256 of raw body via TENANT_HMAC_SECRET
 * Headers: X-Distributor-Signature, X-Distributor-Timestamp, X-Idempotency-Key
 */
export async function POST(request: Request) {
  const limited = rateLimit({
    key: `distributor-provision:${clientIp(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: limited.retryAfterSeconds
          ? { "Retry-After": String(limited.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  const secret = getTenantHmacSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "TENANT_HMAC_SECRET is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("X-Distributor-Signature");
  const timestamp = request.headers.get("X-Distributor-Timestamp");
  const idempotencyKey = request.headers.get("X-Idempotency-Key")?.trim() ?? "";

  const verified = verifyDistributorSignature({
    rawBody,
    signatureHeader: signature,
    timestampHeader: timestamp,
    secret,
  });
  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error },
      { status: verified.status },
    );
  }

  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      { error: "X-Idempotency-Key must be a UUID." },
      { status: 400 },
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseDistributorProvisionBody(parsedJson);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await provisionDistributorTenant({
    body: parsed.data,
    rawBody,
    idempotencyKey,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      tenant_id: result.response.tenant_id,
      admin_email: result.response.admin_email,
      temporary_password: result.response.temporary_password,
      access_url: result.response.access_url,
    },
    {
      status: 200,
      headers: {
        "X-Idempotent-Replay": result.replay ? "1" : "0",
      },
    },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed. Use POST with HMAC distributor headers.",
      endpoint: "/api/v1/tenants/provision",
    },
    { status: 405 },
  );
}
