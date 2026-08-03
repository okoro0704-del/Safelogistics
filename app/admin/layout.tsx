import { redirect } from "next/navigation";

import { AdminShell } from "@/components/layout/admin-shell";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCompanyBrand } from "@/lib/branding/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, company } = await getSessionUser();

  if (!user || !profile) {
    redirect("/login");
  }

  if (profile.role !== "admin") {
    redirect(profile.role === "customer" ? "/dashboard" : "/unauthorized");
  }

  if (company?.status === "suspended") {
    redirect("/suspended");
  }

  const brand = await resolveCompanyBrand({
    companyId: company?.id,
    companyName: company?.name,
    companySlug: company?.slug,
    logo_url: company?.logo_url,
    primary_color: company?.primary_color,
  });

  return (
    <AdminShell
      userName={profile.full_name}
      userEmail={profile.email}
      companyName={company?.name}
      brand={brand}
    >
      {children}
    </AdminShell>
  );
}
