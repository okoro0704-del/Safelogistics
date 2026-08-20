import { NextResponse } from "next/server";

import {
  getDefaultMailbox,
  isMailboxFolder,
  requireCompanyAdmin,
  type MailboxFolder,
} from "@/lib/email/mailbox";
import { sendTenantEmail } from "@/lib/email/service";
import { MailProviderError } from "@/lib/email/providers";
import { friendlyErrorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

async function folderCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
) {
  const folders: MailboxFolder[] = ["inbox", "sent", "drafts", "spam"];
  const counts: Record<MailboxFolder, number> = {
    inbox: 0,
    sent: 0,
    drafts: 0,
    spam: 0,
  };
  let unreadInbox = 0;

  await Promise.all(
    folders.map(async (folder) => {
      let q = supabase
        .from("email_threads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("folder", folder);
      if (folder === "drafts") {
        q = q.is("customer_id", null);
      }
      const { count } = await q;
      counts[folder] = count ?? 0;
    }),
  );

  const { count: unread } = await supabase
    .from("email_threads")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("folder", "inbox")
    .eq("is_read", false);
  unreadInbox = unread ?? 0;

  return { counts, unreadInbox };
}

export async function GET(request: Request) {
  try {
    const auth = await requireCompanyAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const folderParam = searchParams.get("folder") ?? "inbox";
    const folder = isMailboxFolder(folderParam) ? folderParam : "inbox";

    let query = auth.supabase
      .from("email_threads")
      .select("*")
      .eq("company_id", auth.companyId)
      .eq("folder", folder)
      .order("last_message_at", { ascending: false })
      .limit(100);

    // Company drafts only — customer drafts live under customer_folder.
    if (folder === "drafts") {
      query = query.is("customer_id", null);
    }

    const { data: threads, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error.message,
            "Unable to load mailbox. Run scripts/mailbox-folders.sql in Supabase if folders are missing.",
          ),
        },
        { status: 400 },
      );
    }

    const { counts, unreadInbox } = await folderCounts(
      auth.supabase,
      auth.companyId,
    );

    const mailbox = await getDefaultMailbox(auth.supabase, auth.companyId);

    return NextResponse.json({
      folder,
      threads: threads ?? [],
      counts,
      unreadInbox,
      mailboxAddress: mailbox?.full_address ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to load mailbox.") },
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
      action?: "send" | "save_draft";
      thread_id?: string;
      to?: string[];
      subject?: string;
      text?: string;
      html?: string;
    };

    const action = body.action ?? "send";
    const to = (body.to ?? []).map((t) => t.trim()).filter(Boolean);
    const subject = body.subject?.trim() || "(no subject)";
    const text = body.text?.trim() ?? "";

    const mailbox = await getDefaultMailbox(auth.supabase, auth.companyId);
    if (!mailbox) {
      return NextResponse.json(
        {
          error:
            "No company mailbox configured. Ask Master Admin to set up email for this company.",
        },
        { status: 400 },
      );
    }

    if (action === "save_draft") {
      if (!to.length && !subject && !text) {
        return NextResponse.json(
          { error: "Draft is empty." },
          { status: 400 },
        );
      }

      let threadId = body.thread_id ?? null;
      if (threadId) {
        const { data: existing, error: existingError } = await auth.supabase
          .from("email_threads")
          .select("id, folder")
          .eq("id", threadId)
          .eq("company_id", auth.companyId)
          .maybeSingle();
        if (existingError || !existing) {
          return NextResponse.json(
            { error: "Draft not found." },
            { status: 404 },
          );
        }
        if ((existing as { folder: string }).folder !== "drafts") {
          return NextResponse.json(
            { error: "Only drafts can be updated this way." },
            { status: 400 },
          );
        }
        const { error: updateError } = await auth.supabase
          .from("email_threads")
          .update({
            subject,
            participants: to,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_read: true,
            folder: "drafts",
          })
          .eq("id", threadId);
        if (updateError) {
          return NextResponse.json(
            { error: friendlyErrorMessage(updateError.message, "Unable to save draft.") },
            { status: 400 },
          );
        }
        await auth.supabase
          .from("email_messages")
          .delete()
          .eq("thread_id", threadId)
          .eq("company_id", auth.companyId);
      } else {
        const { data: thread, error: threadError } = await auth.supabase
          .from("email_threads")
          .insert({
            company_id: auth.companyId,
            mailbox_id: mailbox.id,
            subject,
            participants: to,
            folder: "drafts",
            is_read: true,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (threadError || !thread) {
          return NextResponse.json(
            {
              error: friendlyErrorMessage(
                threadError?.message,
                "Unable to save draft. Run scripts/mailbox-folders.sql in Supabase if folders are missing.",
              ),
            },
            { status: 400 },
          );
        }
        threadId = (thread as { id: string }).id;
      }

      const { data: message, error: messageError } = await auth.supabase
        .from("email_messages")
        .insert({
          company_id: auth.companyId,
          thread_id: threadId,
          mailbox_id: mailbox.id,
          direction: "outbound",
          from_address: mailbox.full_address,
          to_addresses: to,
          subject,
          text_body: text || null,
          html_body: body.html ?? null,
        })
        .select("*")
        .single();

      if (messageError || !message) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              messageError?.message,
              "Unable to store draft message.",
            ),
          },
          { status: 400 },
        );
      }

      return NextResponse.json({ threadId, message, draft: true });
    }

    if (to.length === 0) {
      return NextResponse.json(
        { error: "At least one recipient is required." },
        { status: 400 },
      );
    }

    const result = await sendTenantEmail({
      companyId: auth.companyId,
      from: mailbox.full_address,
      to,
      subject,
      text: body.text,
      html: body.html,
      threadId: body.thread_id ?? null,
      mailboxId: mailbox.id,
      supabase: auth.supabase,
    });

    // If sending a draft, replace draft body with the sent message already stored;
    // sendTenantEmail moves folder drafts → sent.
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof MailProviderError
        ? error.message
        : friendlyErrorMessage(error, "Unable to send email.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
