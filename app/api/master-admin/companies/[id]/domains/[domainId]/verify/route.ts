import { NextResponse } from "next/server";

import {
  canAttemptVerification,
  recordVerificationAttempt,
} from "@/lib/domains/rate-limit";
import { invalidateDomainCache } from "@/lib/domains/resolve";
import { verifyDomainTxtRecord } from "@/lib/domains/verify-dns";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";
import type { CompanyDomain } from "@/lib/domains/normalize";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; domainId: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const supabase = auth.supabase;
    const { id: companyId, domainId } = await context.params;

    const cooldown = canAttemptVerification(domainId);
    if (!cooldown.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${cooldown.retryAfterSeconds}s before trying verification again.`,
        },
        { status: 429 },
      );
    }

    const { data: row, error: loadError } = await supabase
      .from("company_domains")
      .select("*")
      .eq("id", domainId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (loadError || !row) {
      return NextResponse.json({ error: "Domain not found." }, { status: 404 });
    }

    const domain = row as CompanyDomain;
    if (domain.status === "disabled") {
      return NextResponse.json(
        { error: "Re-enable the domain before verifying." },
        { status: 400 },
      );
    }

    recordVerificationAttempt(domainId);
    await supabase.rpc("master_touch_domain_verification_attempt", {
      p_domain_id: domainId,
    });

    const result = await verifyDomainTxtRecord({
      normalizedDomain: domain.normalized_domain,
      verificationToken: domain.verification_token,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            "We couldn't complete DNS verification. Please try again later.",
        },
        { status: 400 },
      );
    }

    if (!result.matched) {
      return NextResponse.json(
        {
          error:
            "We couldn't find the verification record yet. DNS changes can take time to propagate. Please try again later.",
          verified: false,
        },
        { status: 400 },
      );
    }

    const { data: verified, error: verifyError } = await supabase.rpc(
      "master_mark_domain_verified",
      { p_domain_id: domainId },
    );

    if (verifyError || !verified) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            verifyError?.message ?? "Failed",
            "Unable to mark domain as verified.",
          ),
        },
        { status: 400 },
      );
    }

    invalidateDomainCache(domain.normalized_domain);

    if (process.env.NODE_ENV === "development") {
      console.info("domain verification succeeded", {
        domainId,
        domain: domain.normalized_domain,
        at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      domain: verified,
      verified: true,
      message: "Domain verified successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to verify domain."),
      },
      { status: 500 },
    );
  }
}
