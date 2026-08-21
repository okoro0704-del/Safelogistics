import { NextResponse } from "next/server";

import { verifyResendWebhookSignature } from "@/lib/email/service";
import { createResendMailProviderFromEnv } from "@/lib/email/providers/resend";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { normalizeHostname } from "@/lib/domains/normalize";

export const dynamic = "force-dynamic";

type InboundPayload = {
  type?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    from?: string | { address?: string; name?: string };
    to?: Array<string | { address?: string }>;
    received_for?: Array<string | { address?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
  };
};

function extractAddress(
  value: string | { address?: string; name?: string } | undefined,
): string {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] ?? value).trim().toLowerCase();
  }
  return String(value.address ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const payload = await request.text();
  const signature =
    request.headers.get("svix-signature") ||
    request.headers.get("resend-signature") ||
    request.headers.get("x-resend-signature");
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");

  if (secret) {
    const ok = verifyResendWebhookSignature({
      payload,
      signatureHeader: signature,
      secret,
      svixId,
      svixTimestamp,
    });
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  let body: InboundPayload;
  try {
    body = JSON.parse(payload) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = (body.type ?? "").toLowerCase();
  if (
    eventType &&
    !eventType.includes("email.received") &&
    eventType !== "inbound"
  ) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = body.data ?? {};
  let from = extractAddress(data.from);
  let toList = [
    ...(data.to ?? []).map((t) => extractAddress(t)),
    ...(data.received_for ?? []).map((t) => extractAddress(t)),
  ].filter(Boolean);
  toList = [...new Set(toList)];

  const inboundId =
    data.email_id || data.message_id || data.headers?.["message-id"] || null;

  // Webhook metadata often omits bodies — fetch from Receiving API.
  let textBody = data.text ?? null;
  let htmlBody = data.html ?? null;
  let subject = data.subject?.trim() || "(no subject)";

  if (inboundId && data.email_id) {
    try {
      const mail = createResendMailProviderFromEnv();
      const received = await mail.getReceivedEmail(data.email_id);
      if (received) {
        textBody = received.text ?? textBody;
        htmlBody = received.html ?? htmlBody;
        if (received.subject?.trim()) subject = received.subject.trim();
        if (received.from) from = extractAddress(received.from) || from;
        if (received.to.length > 0) {
          toList = [...new Set([...toList, ...received.to.map((t) => extractAddress(t)).filter(Boolean)])];
        }
      }
    } catch (err) {
      console.warn("resend receiving fetch failed", err);
    }
  }

  if (!from || toList.length === 0) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  let companyId: string | null = null;
  let mailboxId: string | null = null;

  const { data: mailbox } = await supabase
    .from("company_mailboxes")
    .select("*")
    .in("full_address", toList)
    .limit(1)
    .maybeSingle();

  if (mailbox) {
    companyId = (mailbox as { company_id: string }).company_id;
    mailboxId = (mailbox as { id: string }).id;
  } else {
    const domainPart = toList[0]!.split("@")[1];
    const host = normalizeHostname(domainPart);
    if (host) {
      const { data: emailDomain } = await supabase
        .from("company_email_domains")
        .select("*")
        .eq("normalized_domain", host)
        .eq("status", "verified")
        .maybeSingle();
      if (emailDomain) {
        companyId = (emailDomain as { company_id: string }).company_id;
        const { data: fallbackMailbox } = await supabase
          .from("company_mailboxes")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_default", true)
          .maybeSingle();
        mailboxId = (fallbackMailbox as { id?: string } | null)?.id ?? null;
      }
    }
  }

  if (!companyId) {
    console.warn("resend inbound unmatched", { toList, from, inboundId });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  if (inboundId) {
    const { data: existing } = await supabase
      .from("email_messages")
      .select("id")
      .eq("resend_inbound_id", inboundId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  const { data: customerProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "customer")
    .ilike("email", from)
    .maybeSingle();
  const customerId =
    (customerProfile as { id?: string } | null)?.id ?? null;

  const { data: existingThread } = await supabase
    .from("email_threads")
    .select("id, folder")
    .eq("company_id", companyId)
    .eq("subject", subject)
    .neq("folder", "drafts")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let threadId = (existingThread as { id?: string } | null)?.id;
  if (!threadId) {
    const { data: thread, error: threadError } = await supabase
      .from("email_threads")
      .insert({
        company_id: companyId,
        mailbox_id: mailboxId,
        subject,
        participants: [from, ...toList],
        folder: "inbox",
        is_read: false,
        customer_id: customerId,
        customer_folder: customerId ? "sent" : "inbox",
        customer_is_read: true,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (threadError || !thread) {
      return NextResponse.json(
        { error: threadError?.message ?? "thread failed" },
        { status: 500 },
      );
    }
    threadId = (thread as { id: string }).id;
  } else {
    const existingFolder = (existingThread as { folder?: string } | null)
      ?.folder;
    await supabase
      .from("email_threads")
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_read: false,
        ...(existingFolder === "spam" ? {} : { folder: "inbox" }),
        ...(customerId
          ? {
              customer_id: customerId,
              customer_folder: "sent",
              customer_is_read: true,
            }
          : {}),
      })
      .eq("id", threadId);
  }

  const { error: messageError } = await supabase.from("email_messages").insert({
    company_id: companyId,
    thread_id: threadId,
    mailbox_id: mailboxId,
    direction: "inbound",
    from_address: from,
    to_addresses: toList,
    subject,
    text_body: textBody,
    html_body: htmlBody,
    resend_inbound_id: inboundId,
    provider_message_id: data.message_id ?? null,
    raw_headers: data.headers ?? null,
  });

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, synced: true });
}
