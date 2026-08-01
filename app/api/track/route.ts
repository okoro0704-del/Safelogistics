import { NextResponse } from "next/server";

import { normalizeHostname } from "@/lib/domains/normalize";
import { resolveCompanyFromHostname } from "@/lib/domains/resolve-hostname";
import { friendlyErrorMessage } from "@/lib/format";
import { rateLimitPublicTracking } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { PublicTrackingResult } from "@/lib/types/database";
import { isValidTrackingNumber, normalizeTrackingNumber } from "@/lib/utils";

function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

/**
 * Public tracking — rate-limited.
 * Company scope comes only from Host → active company_domains (never body/query).
 * RPC is server-only (service role) so browsers cannot bypass rate limits.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const host = normalizeHostname(request.headers.get("host")) ?? "platform";

    const limited = rateLimitPublicTracking(ip, host);
    if (!limited.allowed) {
      return NextResponse.json(
        {
          error: `Too many tracking lookups. Please wait ${limited.retryAfterSeconds}s.`,
        },
        { status: 429 },
      );
    }

    const body = (await request.json()) as {
      tracking_number?: string;
      company_id?: unknown;
    };

    // Ignore any client-supplied company_id
    void body.company_id;

    const trackingNumber = normalizeTrackingNumber(
      String(body.tracking_number ?? ""),
    );

    if (!trackingNumber || !isValidTrackingNumber(trackingNumber)) {
      return NextResponse.json(
        { found: false, message: "No delivery found for this tracking number" },
        { status: 200 },
      );
    }

    // Resolve tenant from Host only (middleware already strips spoofed headers)
    const sessionClient = await createClient();
    const tenant = await resolveCompanyFromHostname(host, sessionClient);
    const companyId = tenant?.company_id ?? null;

    let service;
    try {
      service = createServiceRoleClient();
    } catch {
      return NextResponse.json(
        { error: "Tracking is temporarily unavailable." },
        { status: 503 },
      );
    }

    const args: {
      p_tracking_number: string;
      p_company_id?: string;
    } = { p_tracking_number: trackingNumber };

    if (companyId) {
      args.p_company_id = companyId;
    }

    const { data, error } = await service.rpc("get_public_tracking", args);

    if (error) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error.message,
            "Unable to look up tracking number.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(data as PublicTrackingResult, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(
          error,
          "Unable to look up tracking number.",
        ),
      },
      { status: 500 },
    );
  }
}
