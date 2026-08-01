import { NextResponse } from "next/server";

import type { CompanyDomain } from "@/lib/domains/normalize";
import {
  buildManualDnsInstructions,
  checkDomainHealth,
} from "@/lib/domains/provision";
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

    const cooldown = canAttemptDomainAction(`status:${domainId}`);
    if (!cooldown.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${cooldown.retryAfterSeconds}s before checking again.`,
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
        { error: "Domain is disabled.", domain },
        { status: 400 },
      );
    }

    recordDomainActionAttempt(`status:${domainId}`);
    const health = await checkDomainHealth(domain);

    let updated = domain;

    if (health.canActivate) {
      const { data: verified, error: verifyError } = await supabase.rpc(
        "master_mark_domain_verified",
        { p_domain_id: domainId },
      );
      if (verifyError || !verified) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              verifyError?.message ?? "Failed",
              "Unable to activate domain.",
            ),
            health,
            instructions: buildManualDnsInstructions(domain),
          },
          { status: 400 },
        );
      }
      updated = verified as CompanyDomain;
      invalidateDomainCache(domain.normalized_domain);

      return NextResponse.json({
        domain: updated,
        health: { ...health, canActivate: true },
        activated: true,
        message: "Domain verified successfully.",
        instructions: buildManualDnsInstructions(updated),
      });
    }

    // Stay in verifying / pending with updated check timestamp
    const nextStatus: CompanyDomain["status"] =
      domain.status === "failed"
        ? "failed"
        : health.ownershipVerified
          ? "verifying"
          : domain.status === "pending"
            ? "pending"
            : "verifying";

    const { data: touched } = await supabase.rpc("master_set_domain_lifecycle", {
      p_domain_id: domainId,
      p_status: nextStatus,
      p_ssl_status: health.sslReady
        ? "ready"
        : health.ownershipVerified
          ? "provisioning"
          : domain.ssl_status,
      p_hosting_status: health.hostingReady
        ? "ready"
        : domain.hosting_status,
      p_clear_error: false,
    });

    if (touched) updated = touched as CompanyDomain;

    return NextResponse.json({
      domain: updated,
      health,
      activated: false,
      message: health.messages[0] ??
        "DNS changes can take several minutes to propagate.",
      instructions: buildManualDnsInstructions(updated),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to check domain status."),
      },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; domainId: string }> },
) {
  const auth = await requireMasterAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id: companyId, domainId } = await context.params;
  const { data: row, error } = await auth.supabase
    .from("company_domains")
    .select("*")
    .eq("id", domainId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Domain not found." }, { status: 404 });
  }

  const domain = row as CompanyDomain;
  return NextResponse.json({
    domain,
    instructions: buildManualDnsInstructions(domain),
  });
}
