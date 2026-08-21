import { createHmac, timingSafeEqual } from "crypto";

import {
  createRegistrarProvider,
  type DnsHostRecord,
} from "@/lib/domains/providers/registrar";
import { requireMailProvider } from "@/lib/email/providers";
import { normalizeHostname } from "@/lib/domains/normalize";

function hostNameForRecord(fullName: string, apex: string): string {
  const name = fullName.replace(/\.$/, "").toLowerCase();
  const root = apex.toLowerCase();
  if (name === root || name === "@") return "@";
  if (name.endsWith(`.${root}`)) {
    return name.slice(0, -(root.length + 1)) || "@";
  }
  return name;
}

export async function provisionCompanyEmailDomain(input: {
  companyId: string;
  domain: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const domain = normalizeHostname(input.domain);
  if (!domain) throw new Error("Invalid email domain.");

  const mail = requireMailProvider();
  const created = await mail.createDomain(domain);

  const { data: emailDomain, error } = await input.supabase.rpc(
    "master_upsert_company_email_domain",
    {
      p_company_id: input.companyId,
      p_domain: domain,
      p_resend_domain_id: created.id,
      p_status: created.status === "verified" ? "verified" : "pending",
      p_last_error: null,
    },
  );

  if (error || !emailDomain) {
    throw new Error(error?.message ?? "Unable to save email domain.");
  }

  // Push MX/TXT/CNAME to Namecheap when registrar is available
  const registrar = createRegistrarProvider();
  if (registrar && created.records.length > 0) {
    try {
      const existing = await registrar.getDnsHosts(domain);
      const keep = existing.filter((h) => {
        const type = h.recordType.toUpperCase();
        // Drop prior mail-ish records we manage; keep web CNAME/TXT verify
        if (type === "MX") return false;
        if (type === "TXT" && /resend|spf|dkim|dmarc/i.test(h.address)) {
          return false;
        }
        if (type === "CNAME" && /resend|_domainkey/i.test(h.hostName)) {
          return false;
        }
        return true;
      });

      const mailHosts: DnsHostRecord[] = created.records.map((r) => ({
        hostName: hostNameForRecord(r.name, domain),
        recordType: r.type,
        address: r.value,
        ttl: r.ttl ?? 300,
        mxPref: r.priority ?? 10,
      }));

      await registrar.setDnsHosts(domain, [...keep, ...mailHosts]);
    } catch (dnsError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("email DNS push", dnsError);
      }
    }
  }

  const { data: mailbox } = await input.supabase.rpc(
    "master_ensure_default_mailbox",
    {
      p_email_domain_id: (emailDomain as { id: string }).id,
      p_local_part: "support",
    },
  );

  return {
    emailDomain,
    mailbox,
    records: created.records,
    message:
      created.status === "verified"
        ? "Email domain verified."
        : "Email domain created. DNS records applied when possible — click Verify when ready.",
  };
}

export async function verifyCompanyEmailDomain(input: {
  emailDomainId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const { data: row, error } = await input.supabase
    .from("company_email_domains")
    .select("*")
    .eq("id", input.emailDomainId)
    .maybeSingle();

  if (error || !row) {
    throw new Error(error?.message ?? "Email domain not found.");
  }

  const resendId = (row as { resend_domain_id?: string | null }).resend_domain_id;
  if (!resendId) throw new Error("Resend domain id missing.");

  const mail = requireMailProvider();
  const verified = await mail.verifyDomain(resendId);
  const status = verified.status;

  const { data: updated, error: updateError } = await input.supabase.rpc(
    "master_upsert_company_email_domain",
    {
      p_company_id: (row as { company_id: string }).company_id,
      p_domain: (row as { normalized_domain: string }).normalized_domain,
      p_resend_domain_id: resendId,
      p_status: status,
      p_last_error:
        status === "failed" ? "Resend could not verify domain DNS yet." : null,
    },
  );

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Unable to update email domain.");
  }

  if (status === "verified") {
    await input.supabase.rpc("master_ensure_default_mailbox", {
      p_email_domain_id: input.emailDomainId,
      p_local_part: "support",
    });
  }

  return { emailDomain: updated, records: verified.records, status };
}

export async function sendTenantEmail(input: {
  companyId: string;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  threadId?: string | null;
  mailboxId?: string | null;
  customerId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const mail = requireMailProvider();
  const sent = await mail.send({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  let customerId = input.customerId ?? null;
  if (!customerId && input.to[0]) {
    const { data: customer } = await input.supabase
      .from("profiles")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("role", "customer")
      .ilike("email", input.to[0].trim())
      .maybeSingle();
    customerId = (customer as { id?: string } | null)?.id ?? null;
  }

  let threadId = input.threadId;
  if (!threadId) {
    const { data: thread, error } = await input.supabase
      .from("email_threads")
      .insert({
        company_id: input.companyId,
        mailbox_id: input.mailboxId,
        subject: input.subject || "(no subject)",
        participants: input.to,
        folder: "sent",
        is_read: true,
        customer_id: customerId,
        customer_folder: customerId ? "inbox" : "inbox",
        customer_is_read: customerId ? false : true,
        last_message_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error || !thread) {
      throw new Error(error?.message ?? "Unable to create email thread.");
    }
    threadId = (thread as { id: string }).id;
  } else {
    const { data: existing } = await input.supabase
      .from("email_threads")
      .select("folder, customer_id")
      .eq("id", threadId)
      .maybeSingle();
    const currentFolder = (existing as { folder?: string } | null)?.folder;
    const existingCustomerId =
      (existing as { customer_id?: string | null } | null)?.customer_id ?? null;
    await input.supabase
      .from("email_threads")
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_read: true,
        ...(currentFolder === "drafts" ? { folder: "sent" } : {}),
        ...(customerId || existingCustomerId
          ? {
              customer_id: customerId || existingCustomerId,
              customer_folder: "inbox",
              customer_is_read: false,
            }
          : {}),
      })
      .eq("id", threadId);
  }

  const { data: message, error: messageError } = await input.supabase
    .from("email_messages")
    .insert({
      company_id: input.companyId,
      thread_id: threadId,
      mailbox_id: input.mailboxId,
      direction: "outbound",
      from_address: input.from,
      to_addresses: input.to,
      subject: input.subject || "(no subject)",
      text_body: input.text ?? null,
      html_body: input.html ?? null,
      resend_email_id: sent.id,
    })
    .select("*")
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message ?? "Unable to store outbound message.");
  }

  return { threadId, message, resendId: sent.id };
}

/** Verify Resend / Svix webhook signature. */
export function verifyResendWebhookSignature(input: {
  payload: string;
  signatureHeader: string | null;
  secret: string;
  svixId?: string | null;
  svixTimestamp?: string | null;
}): boolean {
  if (!input.secret) return false;

  // Simple shared-secret mode (legacy / local)
  if (input.signatureHeader && input.signatureHeader === input.secret) {
    return true;
  }

  const id = input.svixId?.trim();
  const timestamp = input.svixTimestamp?.trim();
  const signatureHeader = input.signatureHeader?.trim();
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const key = input.secret.startsWith("whsec_")
    ? Buffer.from(input.secret.slice(6), "base64")
    : Buffer.from(input.secret, "utf8");

  const toSign = `${id}.${timestamp}.${input.payload}`;
  const expected = createHmac("sha256", key).update(toSign).digest("base64");

  // svix-signature: "v1,<sig>" or multiple space-separated versions
  const candidates = signatureHeader.split(/\s+/).flatMap((chunk) => {
    if (chunk.startsWith("v1,")) return [chunk.slice(3)];
    if (chunk.startsWith("v1=")) return [chunk.slice(3)];
    const parts = chunk.split("=");
    if (parts[0] === "v1" && parts[1]) return [parts[1]];
    return [];
  });

  for (const candidate of candidates) {
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(candidate);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}
