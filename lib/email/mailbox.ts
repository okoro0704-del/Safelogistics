import { createClient } from "@/lib/supabase/server";

export const MAILBOX_FOLDERS = ["inbox", "sent", "drafts", "spam"] as const;
export type MailboxFolder = (typeof MAILBOX_FOLDERS)[number];

export function isMailboxFolder(value: unknown): value is MailboxFolder {
  return (
    typeof value === "string" &&
    (MAILBOX_FOLDERS as readonly string[]).includes(value)
  );
}

export async function requireCompanyAdmin() {
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
      error: "Only company admins can access the mailbox.",
    };
  }
  return { ok: true as const, supabase, companyId, user };
}

export async function requireCompanyCustomer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const row = profile as {
    role?: string;
    company_id?: string;
    email?: string;
    full_name?: string;
  } | null;
  if (row?.role !== "customer" || !row.company_id) {
    return {
      ok: false as const,
      status: 403,
      error: "Only customers can access this mailbox.",
    };
  }
  return {
    ok: true as const,
    supabase,
    companyId: row.company_id,
    user,
    email: (row.email ?? user.email ?? "").toLowerCase(),
    fullName: row.full_name ?? "",
  };
}

export async function getDefaultMailbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
) {
  const { data: mailbox } = await supabase
    .from("company_mailboxes")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();
  return mailbox as { id: string; full_address: string } | null;
}

