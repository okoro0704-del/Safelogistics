import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Settings,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCompanyBrand } from "@/lib/branding/server";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/deliveries", label: "Deliveries", icon: Package },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

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
    <AppShell
      title="Admin"
      subtitle="Admin portal"
      navItems={navItems}
      userName={profile.full_name}
      userEmail={profile.email}
      homeHref="/admin"
      companyName={company?.name}
      brand={brand}
    >
      {children}
    </AppShell>
  );
}
