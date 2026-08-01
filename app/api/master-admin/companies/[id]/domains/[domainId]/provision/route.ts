import { NextResponse } from "next/server";

import type { CompanyDomain, CompanyDomainStatus } from "@/lib/domains/normalize";
import { provisionCompanyDomain } from "@/lib/domains/provision";
import {
  canAttemptDomainAction,
  recordDomainActionAttempt,
} from "@/lib/domains/rate-limit";
import { invalidateDomainCache } from "@/lib/domains/resolve-hostname";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

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

    const cooldown = canAttemptDomainAction(domainId);
    if (!cooldown.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${cooldown.retryAfterSeconds}s before trying again.`,
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
        { error: "Re-enable or re-add the domain before connecting." },
        { status: 400 },
      );
    }
    if (domain.status === "active") {
      return NextResponse.json({
        domain,
        message: "Domain is already active.",
      });
    }

    recordDomainActionAttempt(domainId);

    await supabase.rpc("master_set_domain_lifecycle", {
      p_domain_id: domainId,
      p_status: "provisioning",
      p_clear_error: true,
    });

    const result = await provisionCompanyDomain(domain);

    const nextStatus = (result.domainPatch.status ??
      "verifying") as CompanyDomainStatus;

    const { data: updated, error: updateError } = await supabase.rpc(
      "master_set_domain_lifecycle",
      {
        p_domain_id: domainId,
        p_status: nextStatus,
        p_dns_status: (result.domainPatch.dns_status as string) ?? null,
        p_hosting_status: (result.domainPatch.hosting_status as string) ?? null,
        p_ssl_status: (result.domainPatch.ssl_status as string) ?? null,
        p_last_error: (result.domainPatch.last_error as string) ?? null,
        p_dns_target_record_id:
          (result.domainPatch.dns_target_record_id as string) ?? null,
        p_dns_txt_record_id:
          (result.domainPatch.dns_txt_record_id as string) ?? null,
        p_hosting_domain_id:
          (result.domainPatch.hosting_domain_id as string) ?? null,
        p_provider_zone_id:
          (result.domainPatch.provider_zone_id as string) ?? null,
        p_dns_provider: (result.domainPatch.dns_provider as string) ?? null,
        p_hosting_provider:
          (result.domainPatch.hosting_provider as string) ?? null,
        p_clear_error: !result.domainPatch.last_error,
      },
    );

    if (updateError) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            updateError.message,
            "Unable to save provisioning status.",
          ),
        },
        { status: 400 },
      );
    }

    invalidateDomainCache(domain.normalized_domain);

    return NextResponse.json({
      domain: updated,
      message: result.message,
      manual_fallback: result.manualFallback,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("domain provision", error);
    }
    return NextResponse.json(
      {
        error:
          "We couldn't configure DNS automatically. Please try again or use manual DNS configuration.",
      },
      { status: 500 },
    );
  }
}
