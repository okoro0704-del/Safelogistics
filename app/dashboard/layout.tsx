import { redirect } from "next/navigation";
import { LayoutDashboard, Package, UserRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCompanyBrand } from "@/lib/branding/server";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/deliveries", label: "My Deliveries", icon: Package },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, company } = await getSessionUser();

  if (!user || !profile) {
    redirect("/login");
  }

  if (profile.role !== "customer") {
    redirect(profile.role === "admin" ? "/admin" : "/unauthorized");
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
    <AppShell
      title="Customer"
      subtitle="Customer portal"
      navItems={navItems}
      userName={profile.full_name}
      userEmail={profile.email}
      homeHref="/dashboard"
      companyName={company?.name}
      brand={brand}
    >
      {children}
    </AppShell>
  );
}
