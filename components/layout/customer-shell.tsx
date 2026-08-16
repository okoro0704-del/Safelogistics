"use client";

import { Inbox, LayoutDashboard, Package, UserRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import type { ResolvedBrand } from "@/lib/branding";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/deliveries", label: "My Deliveries", icon: Package },
  { href: "/dashboard/mail", label: "Mailbox", icon: Inbox },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

export function CustomerShell({
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
      title="Customer"
      subtitle="Customer portal"
      navItems={navItems}
      userName={userName}
      userEmail={userEmail}
      homeHref="/dashboard"
      companyName={companyName}
      brand={brand}
    >
      {children}
    </AppShell>
  );
}
