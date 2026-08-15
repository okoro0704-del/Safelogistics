import { NextResponse } from "next/server";

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
  return { ok: true as const, supabase, companyId };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const auth = await requireCompanyAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { threadId } = await context.params;

    const { data: thread, error: threadError } = await auth.supabase
      .from("email_threads")
      .select("*")
      .eq("id", threadId)
      .eq("company_id", auth.companyId)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }

    const { data: messages, error } = await auth.supabase
      .from("email_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("company_id", auth.companyId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: friendlyErrorMessage(error.message, "Unable to load messages.") },
        { status: 400 },
      );
    }

    return NextResponse.json({ thread, messages: messages ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to load thread.") },
      { status: 500 },
    );
  }
}
