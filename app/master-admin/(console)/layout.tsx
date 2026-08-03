import { redirect } from "next/navigation";

import { MasterAdminShell } from "@/components/layout/master-admin-shell";
import { getSessionUser } from "@/lib/auth/session";
import { resolveBrand } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function MasterAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  const { user, profile } = session;

  if (!user || !profile) {
    redirect("/master-admin/login");
  }

  if (profile.role !== "master_admin") {
    redirect("/unauthorized");
  }

  const brand = resolveBrand(null);
  const userName = profile.full_name?.trim() || "Master Admin";
  const userEmail = profile.email?.trim() || user.email || "";

  return (
    <MasterAdminShell userName={userName} userEmail={userEmail} brand={brand}>
      {children}
    </MasterAdminShell>
  );
}
