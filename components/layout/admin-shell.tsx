"use client";

import {
  LayoutDashboard,
  Package,
  Settings,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import type { ResolvedBrand } from "@/lib/branding";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/deliveries", label: "Deliveries", icon: Package },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({
  userName,
  userEmail,
  companyName,
  brand,
  children,
}: {
  userName: string;
  userEmail: string;
  companyName?: string | null;
  brand: ResolvedBrand;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      title="Admin"
      subtitle="Admin portal"
      navItems={navItems}
      userName={userName}
      userEmail={userEmail}
      homeHref="/admin"
      companyName={companyName}
      brand={brand}
    >
      {children}
    </AppShell>
  );
}
