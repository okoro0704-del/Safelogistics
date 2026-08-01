import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import {
  generateVerificationToken,
  isValidHostname,
  normalizeHostname,
} from "@/lib/domains/normalize";
import { invalidateDomainCache } from "@/lib/domains/resolve";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

function newToken() {
  try {
    return generateVerificationToken();
  } catch {
    return randomBytes(32).toString("hex");
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireMasterAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: companyId } = await context.params;
  const { data, error } = await auth.supabase
    .from("company_domains")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error.message, "Unable to load domains."),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ domains: data ?? [] });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const supabase = auth.supabase;
    const { id: companyId } = await context.params;
    const body = (await request.json()) as { domain?: string };
    const normalized = normalizeHostname(body.domain ?? "");

    if (!normalized || !isValidHostname(normalized)) {
      return NextResponse.json(
        {
          error:
            "Enter a valid hostname such as swiftlogistics.com (no https:// or path).",
        },
        { status: 400 },
      );
    }

    const token = newToken();
    const { data, error } = await supabase.rpc("master_add_company_domain", {
      p_company_id: companyId,
      p_domain: normalized,
      p_verification_token: token,
    });

    if (error || !data) {
      const message = error?.message ?? "";
      let errorText = "Unable to add domain.";
      if (message.toLowerCase().includes("already registered")) {
        errorText = "This domain is already registered.";
      } else if (message.toLowerCase().includes("invalid")) {
        errorText = "Enter a valid hostname such as swiftlogistics.com.";
      }
      return NextResponse.json(
        { error: friendlyErrorMessage(message, errorText) },
        { status: 400 },
      );
    }

    invalidateDomainCache(normalized);

    return NextResponse.json({
      domain: data,
      message: "Domain added. Complete DNS verification to activate it.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to add domain."),
      },
      { status: 500 },
    );
  }
}
