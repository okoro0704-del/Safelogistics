import { NextResponse } from "next/server";

import {
  getDefaultMailbox,
  isMailboxFolder,
  requireCompanyCustomer,
  type MailboxFolder,
} from "@/lib/email/mailbox";
import { friendlyErrorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

async function folderCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  customerId: string,
) {
  const folders: MailboxFolder[] = ["inbox", "sent", "drafts", "spam"];
  const counts: Record<MailboxFolder, number> = {
    inbox: 0,
    sent: 0,
    drafts: 0,
    spam: 0,
  };

  await Promise.all(
    folders.map(async (folder) => {
      const { count } = await supabase
        .from("email_threads")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .eq("customer_folder", folder);
      counts[folder] = count ?? 0;
    }),
  );

  const { count: unreadInbox } = await supabase
    .from("email_threads")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("customer_folder", "inbox")
    .eq("customer_is_read", false);

  return { counts, unreadInbox: unreadInbox ?? 0 };
}

export async function GET(request: Request) {
  try {
    const auth = await requireCompanyCustomer();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const folderParam = searchParams.get("folder") ?? "inbox";
    const folder = isMailboxFolder(folderParam) ? folderParam : "inbox";

    const { data: threads, error } = await auth.supabase
      .from("email_threads")
      .select("*")
      .eq("company_id", auth.companyId)
      .eq("customer_id", auth.user.id)
      .eq("customer_folder", folder)
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error.message,
            "Unable to load mailbox. Ask your admin to run scripts/customer-mailbox.sql if this is a new install.",
          ),
        },
        { status: 400 },
      );
    }

    const { counts, unreadInbox } = await folderCounts(
      auth.supabase,
      auth.user.id,
    );

    return NextResponse.json({
      folder,
      threads: threads ?? [],
      counts,
      unreadInbox,
      supportAddress:
        (await getDefaultMailbox(auth.supabase, auth.companyId))?.full_address ??
        null,
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
    const auth = await requireCompanyCustomer();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as {
      action?: "send" | "save_draft";
      thread_id?: string;
      subject?: string;
      text?: string;
    };

    const action = body.action ?? "send";
    const subject = body.subject?.trim() || "(no subject)";
    const text = body.text?.trim() ?? "";
    const mailbox = await getDefaultMailbox(auth.supabase, auth.companyId);

    if (action === "save_draft") {
      if (!subject && !text) {
        return NextResponse.json(
          { error: "Draft is empty." },
          { status: 400 },
        );
      }

      let threadId = body.thread_id ?? null;
      if (threadId) {
        const { data: existing } = await auth.supabase
          .from("email_threads")
          .select("id, customer_folder")
          .eq("id", threadId)
          .eq("customer_id", auth.user.id)
          .maybeSingle();
        if (!existing) {
          return NextResponse.json(
            { error: "Draft not found." },
            { status: 404 },
          );
        }
        if ((existing as { customer_folder: string }).customer_folder !== "drafts") {
          return NextResponse.json(
            { error: "Only drafts can be updated this way." },
            { status: 400 },
          );
        }
        await auth.supabase
          .from("email_threads")
          .update({
            subject,
            participants: mailbox ? [mailbox.full_address] : [],
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            customer_folder: "drafts",
            customer_is_read: true,
            folder: "drafts",
          })
          .eq("id", threadId);
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
            mailbox_id: mailbox?.id ?? null,
            subject,
            participants: mailbox ? [mailbox.full_address] : [auth.email],
            folder: "drafts",
            is_read: true,
            customer_id: auth.user.id,
            customer_folder: "drafts",
            customer_is_read: true,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (threadError || !thread) {
          return NextResponse.json(
            {
              error: friendlyErrorMessage(
                threadError?.message,
                "Unable to save draft. Run scripts/customer-mailbox.sql in Supabase.",
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
          mailbox_id: mailbox?.id ?? null,
          direction: "inbound",
          from_address: auth.email || "customer@local",
          to_addresses: mailbox ? [mailbox.full_address] : [],
          subject,
          text_body: text || null,
        })
        .select("*")
        .single();

      if (messageError || !message) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              messageError?.message,
              "Unable to store draft.",
            ),
          },
          { status: 400 },
        );
      }

      return NextResponse.json({ threadId, message, draft: true });
    }

    if (!text) {
      return NextResponse.json(
        { error: "Message body is required." },
        { status: 400 },
      );
    }

    // Customer → company: stored as inbound for the admin mailbox (in-app).
    let threadId = body.thread_id ?? null;
    let replyKeepInbox = false;
    if (threadId) {
      const { data: existing } = await auth.supabase
        .from("email_threads")
        .select("id, customer_folder")
        .eq("id", threadId)
        .eq("customer_id", auth.user.id)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json(
          { error: "Thread not found." },
          { status: 404 },
        );
      }
      replyKeepInbox =
        (existing as { customer_folder: string }).customer_folder === "inbox";
      await auth.supabase
        .from("email_threads")
        .update({
          subject,
          folder: "inbox",
          is_read: false,
          customer_folder: replyKeepInbox ? "inbox" : "sent",
          customer_is_read: true,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          participants: mailbox
            ? [auth.email, mailbox.full_address]
            : [auth.email],
        })
        .eq("id", threadId);
    } else {
      const { data: thread, error: threadError } = await auth.supabase
        .from("email_threads")
        .insert({
          company_id: auth.companyId,
          mailbox_id: mailbox?.id ?? null,
          subject,
          participants: mailbox
            ? [auth.email, mailbox.full_address]
            : [auth.email],
          folder: "inbox",
          is_read: false,
          customer_id: auth.user.id,
          customer_folder: "sent",
          customer_is_read: true,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (threadError || !thread) {
        return NextResponse.json(
          {
            error: friendlyErrorMessage(
              threadError?.message,
              "Unable to send. Run scripts/customer-mailbox.sql in Supabase.",
            ),
          },
          { status: 400 },
        );
      }
      threadId = (thread as { id: string }).id;
    }

    // If converting a draft, remove prior draft-only body rows then insert sent.
    if (body.thread_id) {
      const { data: prior } = await auth.supabase
        .from("email_messages")
        .select("id, resend_email_id, resend_inbound_id")
        .eq("thread_id", threadId)
        .eq("company_id", auth.companyId);
      const draftOnly = ((prior as Array<{
        id: string;
        resend_email_id: string | null;
        resend_inbound_id: string | null;
      }> | null) ?? []).filter(
        (m) => !m.resend_email_id && !m.resend_inbound_id,
      );
      // Keep real conversation history; only wipe when it was a pure draft (1 msg).
      if ((prior?.length ?? 0) === 1 && draftOnly.length === 1) {
        await auth.supabase
          .from("email_messages")
          .delete()
          .eq("id", draftOnly[0]!.id);
      }
    }

    const { data: message, error: messageError } = await auth.supabase
      .from("email_messages")
      .insert({
        company_id: auth.companyId,
        thread_id: threadId,
        mailbox_id: mailbox?.id ?? null,
        direction: "inbound",
        from_address: auth.email || "customer@local",
        to_addresses: mailbox ? [mailbox.full_address] : [],
        subject,
        text_body: text,
      })
      .select("*")
      .single();

    if (messageError || !message) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            messageError?.message,
            "Unable to store message.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ threadId, message });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Unable to send message.") },
      { status: 400 },
    );
  }
}
