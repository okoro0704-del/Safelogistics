import { NextResponse } from "next/server";

import { requireMasterAdminApi } from "@/lib/master-admin/server";

export const dynamic = "force-dynamic";

/**
 * Master-only diagnostic for Create App failures.
 * GET /api/master-admin/provision-check
 */
export async function GET() {
  const auth = await requireMasterAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: isMaster, error: masterError } = await auth.supabase.rpc(
    "is_master_admin",
  );

  // Probe the provision function signature (expect a validation error, not PGRST202/203)
  const { error: probeError } = await auth.supabase.rpc(
    "master_provision_company",
    {
      p_company_name: "",
      p_company_slug: "probe",
      p_admin_user_id: "00000000-0000-0000-0000-000000000000",
      p_admin_full_name: "Probe",
      p_admin_email: "probe@example.com",
    } as never,
  );

  const probeMessage = probeError?.message ?? "";
  const probeLower = probeMessage.toLowerCase();
  const functionOk =
    probeLower.includes("company name is required") ||
    probeLower.includes("admin user") ||
    probeLower.includes("only the platform master admin");
  const ambiguous =
    probeLower.includes("could not choose") ||
    probeLower.includes("best candidate") ||
    probeError?.code === "PGRST203";
  const missing =
    probeLower.includes("could not find the function") ||
    probeError?.code === "PGRST202";

  return NextResponse.json({
    isMasterAdmin: Boolean(isMaster) && !masterError,
    masterCheckError: masterError?.message ?? null,
    provisionProbe: {
      ok: functionOk,
      ambiguous,
      missing,
      message: probeMessage || null,
      code: probeError?.code ?? null,
      hint: probeError?.hint ?? null,
    },
    nextStep: ambiguous || missing
      ? "Run the latest remove-payments migration (or scripts/fix-provision-overloads.sql) in Supabase SQL Editor, then retry Create App."
      : functionOk
        ? "Provision RPC looks reachable. Retry Create App; if it fails, the new error text should be specific."
        : "Unexpected provision probe response. Paste provisionProbe.message when asking for help.",
  });
}
