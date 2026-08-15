import { NextResponse } from "next/server";

import { canAttemptDomainAction, recordDomainActionAttempt } from "@/lib/domains/rate-limit";
import {
  createRegistrarProvider,
  RegistrarProviderError,
} from "@/lib/domains/providers/registrar";
import { isValidHostname, normalizeHostname } from "@/lib/domains/normalize";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as { domain?: string; domains?: string[] };
    const rawList = body.domains?.length
      ? body.domains
      : body.domain
        ? [body.domain]
        : [];

    const domains = rawList
      .map((d) => normalizeHostname(d) ?? "")
      .filter((d) => d && isValidHostname(d));

    if (domains.length === 0) {
      return NextResponse.json(
        { error: "Enter a valid domain such as example.com." },
        { status: 400 },
      );
    }

    const rateKey = `search:${auth.user.id}`;
    const gate = canAttemptDomainAction(rateKey);
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${gate.retryAfterSeconds}s before searching again.`,
        },
        { status: 429 },
      );
    }
    recordDomainActionAttempt(rateKey);

    const registrar = createRegistrarProvider();
    if (!registrar) {
      return NextResponse.json(
        {
          error:
            "Domain registrar is not configured. Set NAMECHEAP_* or REGISTRAR_PROVIDER=mock.",
        },
        { status: 503 },
      );
    }

    const results = await registrar.checkAvailability(domains);
    const enriched = await Promise.all(
      results.map(async (row) => {
        if (row.priceCents != null) return row;
        const pricing = await registrar.getPricing(row.domain);
        return {
          ...row,
          priceCents: pricing?.priceCents ?? null,
          currency: pricing?.currency ?? "USD",
        };
      }),
    );

    return NextResponse.json({
      results: enriched,
      provider: registrar.id,
    });
  } catch (error) {
    const message =
      error instanceof RegistrarProviderError
        ? error.message
        : friendlyErrorMessage(error, "Unable to search domains.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
