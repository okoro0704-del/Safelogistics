import { NextResponse } from "next/server";

import { listAllPayments } from "@/lib/payments/server";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "all";
    const method = searchParams.get("method") ?? "all";
    const search = searchParams.get("search") ?? "";

    const [{ data: stats, error: statsError }, payments] = await Promise.all([
      auth.supabase.rpc("master_payment_stats"),
      listAllPayments({ status, method, search }),
    ]);

    if (statsError) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            statsError.message,
            "Unable to load payment stats.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { stats, payments },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to load payments.") },
      { status: 500 },
    );
  }
}
