import { NextResponse } from "next/server";

import type { CompanyDomain } from "@/lib/domains/normalize";
import { cleanupProvisionedRecords } from "@/lib/domains/provision";
import { invalidateDomainCache } from "@/lib/domains/resolve-hostname";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; domainId: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const supabase = auth.supabase;
    const { id: companyId, domainId } = await context.params;
    const body = (await request.json()) as {
      action?: "disable" | "enable" | "set_primary";
    };

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
    const action = body.action;

    if (action === "disable") {
      await cleanupProvisionedRecords(domain);

      const { data, error } = await supabase.rpc("master_set_domain_status", {
        p_domain_id: domainId,
        p_status: "disabled",
      });
      if (error || !data) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              error?.message ?? "Failed",
              "Unable to disable domain.",
            ),
          },
          { status: 400 },
        );
      }
      invalidateDomainCache(domain.normalized_domain);
      return NextResponse.json({
        domain: data,
        message: "Domain disabled.",
      });
    }

    if (action === "enable") {
      // Disable clears verification — reclaim requires Connect + verify again
      const { data, error } = await supabase.rpc("master_set_domain_status", {
        p_domain_id: domainId,
        p_status: "pending",
      });
      if (error || !data) {
        const message = error?.message ?? "";
        return NextResponse.json(
          {
            error: message.toLowerCase().includes("already registered")
              ? "This domain is already registered."
              : friendlyErrorMessage(
                  message,
                  "Unable to enable domain.",
                ),
          },
          { status: 400 },
        );
      }
      invalidateDomainCache(domain.normalized_domain);
      return NextResponse.json({
        domain: data,
        message:
          "Domain restored as pending. Connect Domain and verify ownership again.",
      });
    }

    if (action === "set_primary") {
      const { data, error } = await supabase.rpc("master_set_primary_domain", {
        p_domain_id: domainId,
      });
      if (error || !data) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              error?.message ?? "Failed",
              "Unable to set primary domain.",
            ),
          },
          { status: 400 },
        );
      }
      invalidateDomainCache(domain.normalized_domain);
      return NextResponse.json({
        domain: data,
        message: "Primary domain updated.",
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to update domain."),
      },
      { status: 500 },
    );
  }
}
