import { createClient } from "@/lib/supabase/server";
import type { Company, Profile } from "@/lib/types/database";

export type SessionCompany = Pick<
  Company,
  "id" | "name" | "slug" | "status" | "primary_color" | "logo_url"
>;

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null, profile: null, company: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const typedProfile = (profile as Profile | null) ?? null;
  let company: SessionCompany | null = null;

  if (typedProfile?.company_id) {
    const { data: companyRow } = await supabase
      .from("companies")
      .select("id, name, slug, status, primary_color, logo_url")
      .eq("id", typedProfile.company_id)
      .maybeSingle();
    company = (companyRow as SessionCompany | null) ?? null;
  }

  return {
    supabase,
    user,
    profile: typedProfile,
    company,
  };
}

export async function requireUser() {
  const session = await getSessionUser();
  if (!session.user || !session.profile) {
    return { ...session, authorized: false as const };
  }
  return { ...session, authorized: true as const };
}

export async function requireMasterAdmin() {
  const session = await requireUser();
  if (!session.authorized || session.profile?.role !== "master_admin") {
    return { ...session, authorized: false as const };
  }
  return { ...session, authorized: true as const };
}
