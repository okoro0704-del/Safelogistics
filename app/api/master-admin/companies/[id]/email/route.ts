import { NextResponse } from "next/server";

import {
  provisionCompanyEmailDomain,
  verifyCompanyEmailDomain,
} from "@/lib/email/service";
import { MailProviderError } from "@/lib/email/providers";
import { friendlyErrorMessage } from "@/lib/format";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

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

    const [{ data: domains }, { data: mailboxes }] = await Promise.all([
      auth.supabase
        .from("company_email_domains")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      auth.supabase
        .from("company_mailboxes")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
    ]);

    return NextResponse.json({
      domains: domains ?? [],
      mailboxes: mailboxes ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to load email settings.") },
      { status: 500 },
    );
  }
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
    const { id: companyId } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      domain?: string;
      email_domain_id?: string;
    };

    if (body.action === "provision") {
      const result = await provisionCompanyEmailDomain({
        companyId,
        domain: String(body.domain ?? ""),
        supabase: auth.supabase,
      });
      return NextResponse.json(result);
    }

    if (body.action === "verify") {
      const result = await verifyCompanyEmailDomain({
        emailDomainId: String(body.email_domain_id ?? ""),
        supabase: auth.supabase,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof MailProviderError
        ? error.message
        : friendlyErrorMessage(error, "Unable to update email settings.");
    const status =
      error instanceof MailProviderError && error.code === "not_configured"
        ? 503
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
