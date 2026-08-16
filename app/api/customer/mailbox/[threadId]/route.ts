import { NextResponse } from "next/server";

import {
  isMailboxFolder,
  requireCompanyCustomer,
} from "@/lib/email/mailbox";
import { friendlyErrorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const auth = await requireCompanyCustomer();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { threadId } = await context.params;

    const { data: thread, error: threadError } = await auth.supabase
      .from("email_threads")
      .select("*")
      .eq("id", threadId)
      .eq("company_id", auth.companyId)
      .eq("customer_id", auth.user.id)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }

    if (!(thread as { customer_is_read?: boolean }).customer_is_read) {
      await auth.supabase
        .from("email_threads")
        .update({
          customer_is_read: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId)
        .eq("customer_id", auth.user.id);
      (thread as { customer_is_read: boolean }).customer_is_read = true;
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const auth = await requireCompanyCustomer();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { threadId } = await context.params;
    const body = (await request.json()) as {
      folder?: string;
      is_read?: boolean;
    };

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.folder !== undefined) {
      if (!isMailboxFolder(body.folder)) {
        return NextResponse.json({ error: "Invalid folder." }, { status: 400 });
      }
      patch.customer_folder = body.folder;
    }
    if (typeof body.is_read === "boolean") {
      patch.customer_is_read = body.is_read;
    }

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json(
        { error: "No updates provided." },
        { status: 400 },
      );
    }

    const { data: thread, error } = await auth.supabase
      .from("email_threads")
      .update(patch)
      .eq("id", threadId)
      .eq("customer_id", auth.user.id)
      .eq("company_id", auth.companyId)
      .select("*")
      .maybeSingle();

    if (error || !thread) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error?.message,
            "Unable to update thread.",
          ),
        },
        { status: error ? 400 : 404 },
      );
    }

    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to update thread.") },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const auth = await requireCompanyCustomer();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { threadId } = await context.params;

    const { data: existing } = await auth.supabase
      .from("email_threads")
      .select("id, customer_folder")
      .eq("id", threadId)
      .eq("customer_id", auth.user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }

    const folder = (existing as { customer_folder: string }).customer_folder;
    if (folder === "drafts" || folder === "spam") {
      const { error } = await auth.supabase
        .from("email_threads")
        .delete()
        .eq("id", threadId)
        .eq("customer_id", auth.user.id);
      if (error) {
        return NextResponse.json(
          { error: friendlyErrorMessage(error.message, "Unable to delete.") },
          { status: 400 },
        );
      }
      return NextResponse.json({ deleted: true });
    }

    const { data: thread, error } = await auth.supabase
      .from("email_threads")
      .update({
        customer_folder: "spam",
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .eq("customer_id", auth.user.id)
      .select("*")
      .single();

    if (error || !thread) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(error?.message, "Unable to move to spam."),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ thread, movedToSpam: true });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to delete thread.") },
      { status: 500 },
    );
  }
}
