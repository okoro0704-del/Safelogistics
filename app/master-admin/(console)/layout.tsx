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

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/master-admin", label: "Application Hub", icon: LayoutDashboard },
  { href: "/master-admin/companies", label: "Apps", icon: Building2 },
  { href: "/master-admin/billing", label: "Payments", icon: CreditCard },
  { href: "/master-admin/settings", label: "Settings", icon: Settings },
];

export default async function MasterAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  let profile = null;

  try {
    const session = await getSessionUser();
    user = session.user;
    profile = session.profile;
  } catch (error) {
    console.error("MasterAdminLayout session error", error);
    redirect("/master-admin/login");
  }

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
    <AppShell
      title="Application Hub"
      subtitle="Master Admin"
      navItems={navItems}
      userName={userName}
      userEmail={userEmail}
      homeHref="/master-admin"
      variant="platform"
      brand={brand}
    >
      {children}
    </AppShell>
  );
}
