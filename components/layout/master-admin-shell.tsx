"use client";

import {
  Building2,
  LayoutDashboard,
  Settings,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import type { ResolvedBrand } from "@/lib/branding";

const navItems = [
  { href: "/master-admin", label: "Application Hub", icon: LayoutDashboard },
  { href: "/master-admin/companies", label: "Apps", icon: Building2 },
  { href: "/master-admin/settings", label: "Settings", icon: Settings },
];

export function MasterAdminShell({
  userName,
  userEmail,
  brand,
  children,
}: {
  userName: string;
  userEmail: string;
  brand: ResolvedBrand;
  children: React.ReactNode;
}) {
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
