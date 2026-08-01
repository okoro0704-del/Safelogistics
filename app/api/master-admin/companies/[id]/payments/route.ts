import { NextResponse } from "next/server";

import { PAYMENT_METHODS } from "@/lib/payments/constants";
import {
  getCompanyPaymentTotals,
  listCompanyPayments,
} from "@/lib/payments/server";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";
import type { ManualPaymentMethod } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: companyId } = await context.params;
    const [payments, totals] = await Promise.all([
      listCompanyPayments(companyId),
      getCompanyPaymentTotals(companyId),
    ]);

    return NextResponse.json(
      { payments, totals },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to load payments.") },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: companyId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "record_payment") {
      const amount_cents = Number(body.amount_cents);
      const payment_method = body.payment_method as ManualPaymentMethod;
      if (!Number.isInteger(amount_cents) || amount_cents < 0) {
        return NextResponse.json(
          { error: "Amount must be non-negative integer cents." },
          { status: 400 },
        );
      }
      if (!PAYMENT_METHODS.includes(payment_method)) {
        return NextResponse.json(
          { error: "Invalid payment method." },
          { status: 400 },
        );
      }
      const { data, error } = await auth.supabase.rpc("master_record_payment", {
        p_company_id: companyId,
        p_amount_cents: amount_cents,
        p_currency: String(body.currency ?? "USD").trim().toUpperCase(),
        p_payment_method: payment_method,
        p_payment_date: body.payment_date ? String(body.payment_date) : null,
        p_reference: body.reference ? String(body.reference) : null,
        p_notes: body.notes ? String(body.notes) : null,
      });
      if (error || !data) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              error?.message ?? "Failed",
              "Unable to record payment.",
            ),
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ payment: data });
    }

    if (action === "void_payment") {
      const payment_id = String(body.payment_id ?? "");
      if (!payment_id) {
        return NextResponse.json(
          { error: "payment_id is required." },
          { status: 400 },
        );
      }
      const { data, error } = await auth.supabase.rpc("master_void_payment", {
        p_payment_id: payment_id,
        p_reason: body.reason ? String(body.reason) : null,
      });
      if (error || !data) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              error?.message ?? "Failed",
              "Unable to void payment.",
            ),
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ payment: data });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to update payments.") },
      { status: 500 },
    );
  }
}
