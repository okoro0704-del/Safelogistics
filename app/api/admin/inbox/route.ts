import { NextResponse } from "next/server";

import { sendTenantEmail } from "@/lib/email/service";
import { MailProviderError } from "@/lib/email/providers";
import { friendlyErrorMessage } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireCompanyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile as { role?: string; company_id?: string } | null)?.role;
  const companyId = (profile as { company_id?: string } | null)?.company_id;
  if (role !== "admin" || !companyId) {
    return {
      ok: false as const,
      status: 403,
      error: "Only company admins can access the inbox.",
    };
  }
  return { ok: true as const, supabase, companyId, user };
}

export async function GET() {
  try {
    const auth = await requireCompanyAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data: threads, error } = await auth.supabase
      .from("email_threads")
      .select("*")
      .eq("company_id", auth.companyId)
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: friendlyErrorMessage(error.message, "Unable to load inbox.") },
        { status: 400 },
      );
    }

    return NextResponse.json({ threads: threads ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to load inbox.") },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireCompanyAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as {
      thread_id?: string;
      to?: string[];
      subject?: string;
      text?: string;
      html?: string;
    };

    const { data: mailbox } = await auth.supabase
      .from("company_mailboxes")
      .select("*")
      .eq("company_id", auth.companyId)
      .eq("is_default", true)
      .maybeSingle();

    if (!mailbox) {
      return NextResponse.json(
        {
          error:
            "No company mailbox configured. Ask Master Admin to set up email for this company.",
        },
        { status: 400 },
      );
    }

    const to = (body.to ?? []).map((t) => t.trim()).filter(Boolean);
    if (to.length === 0) {
      return NextResponse.json(
        { error: "At least one recipient is required." },
        { status: 400 },
      );
    }

    const result = await sendTenantEmail({
      companyId: auth.companyId,
      from: (mailbox as { full_address: string }).full_address,
      to,
      subject: body.subject?.trim() || "(no subject)",
      text: body.text,
      html: body.html,
      threadId: body.thread_id ?? null,
      mailboxId: (mailbox as { id: string }).id,
      supabase: auth.supabase,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof MailProviderError
        ? error.message
        : friendlyErrorMessage(error, "Unable to send email.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
