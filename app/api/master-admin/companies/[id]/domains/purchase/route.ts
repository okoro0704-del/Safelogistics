import { NextResponse } from "next/server";

import { purchaseCompanyDomain } from "@/lib/domains/purchase";
import { canAttemptDomainAction, recordDomainActionAttempt } from "@/lib/domains/rate-limit";
import { RegistrarProviderError } from "@/lib/domains/providers/registrar";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: companyId } = await context.params;
    const body = (await request.json()) as {
      domain?: string;
      years?: number;
      contact?: Record<string, string>;
    };

    const domain = String(body.domain ?? "").trim();
    if (!domain) {
      return NextResponse.json({ error: "Domain is required." }, { status: 400 });
    }

    const rateKey = `purchase:${companyId}:${domain.toLowerCase()}`;
    const gate = canAttemptDomainAction(rateKey);
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${gate.retryAfterSeconds}s before retrying this purchase.`,
        },
        { status: 429 },
      );
    }
    recordDomainActionAttempt(rateKey);

    const result = await purchaseCompanyDomain({
      companyId,
      domain,
      years: body.years,
      contact: body.contact
        ? {
            firstName: body.contact.firstName,
            lastName: body.contact.lastName,
            address1: body.contact.address1,
            city: body.contact.city,
            stateProvince: body.contact.stateProvince,
            postalCode: body.contact.postalCode,
            country: body.contact.country,
            phone: body.contact.phone,
            emailAddress: body.contact.emailAddress,
            organizationName: body.contact.organizationName,
          }
        : null,
      supabase: auth.supabase,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof RegistrarProviderError
        ? error.message
        : friendlyErrorMessage(error, "Unable to purchase domain.");
    const status =
      error instanceof RegistrarProviderError && error.code === "not_configured"
        ? 503
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
