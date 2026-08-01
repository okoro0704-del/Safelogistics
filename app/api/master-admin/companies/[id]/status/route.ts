import { NextResponse } from "next/server";

import { invalidateDomainCache } from "@/lib/domains/resolve-hostname";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";
import type { CompanyStatus } from "@/lib/types/database";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = (await request.json()) as { status?: CompanyStatus };

    if (body.status !== "active" && body.status !== "suspended") {
      return NextResponse.json(
        { error: "Status must be active or suspended." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc("master_set_company_status", {
      p_company_id: id,
      p_status: body.status,
    });

    if (error || !data) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error?.message ?? "Failed",
            "Unable to update company status.",
          ),
        },
        { status: 400 },
      );
    }

    const { data: domains } = await auth.supabase
      .from("company_domains")
      .select("normalized_domain")
      .eq("company_id", id);
    for (const row of domains ?? []) {
      invalidateDomainCache(
        (row as { normalized_domain: string }).normalized_domain,
      );
    }

    return NextResponse.json({
      company: data,
      message:
        body.status === "suspended"
          ? "Company suspended."
          : "Company activated.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to update company status."),
      },
      { status: 500 },
    );
  }
}
