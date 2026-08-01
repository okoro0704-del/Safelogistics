import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { resolveBrand } from "@/lib/branding";

const navItems = [
  { href: "/master-admin", label: "Overview", icon: LayoutDashboard },
  { href: "/master-admin/companies", label: "Companies", icon: Building2 },
  { href: "/master-admin/billing", label: "Payments", icon: CreditCard },
  { href: "/master-admin/settings", label: "Settings", icon: Settings },
];

export default async function MasterAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getSessionUser();

  if (!user || !profile) {
    redirect("/login");
  }

  if (profile.role !== "master_admin") {
    redirect("/unauthorized");
  }

  const brand = resolveBrand(null);

  return (
    <AppShell
      title="Master Admin"
      subtitle="Platform"
      navItems={navItems}
      userName={profile.full_name}
      userEmail={profile.email}
      homeHref="/master-admin"
      variant="platform"
      brand={brand}
    >
      {children}
    </AppShell>
  );
}
