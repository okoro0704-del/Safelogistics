"use client";

import { Inbox, LayoutDashboard, Package, UserRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import type { ResolvedBrand } from "@/lib/branding";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  feature?: string;
};

const ALL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/dashboard/deliveries",
    label: "My Deliveries",
    icon: Package,
    feature: "tracking",
  },
  {
    href: "/dashboard/mail",
    label: "Mailbox",
    icon: Inbox,
    feature: "mailbox",
  },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

function enabled(flags: Record<string, boolean>, key?: string) {
  if (!key) return true;
  // Default on for classic portal unless template turns off
  if (key === "tracking" || key === "mailbox") return flags[key] !== false;
  return flags[key] === true;
}

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
  const flags = brand.featureFlags ?? {};
  const style = brand.dashboardStyle ?? "classic";
  const navItems = ALL_NAV.filter((item) => enabled(flags, item.feature));

  const subtitle =
    style === "tracker"
      ? "Track deliveries"
      : style === "seller"
        ? "Seller shipping"
        : style === "fleet"
          ? "Field operations"
          : style === "enterprise"
            ? "Enterprise ops"
            : "Customer portal";

  return (
    <div data-dashboard-style={style} className={`pm-style-${style}`}>
      <AppShell
        title="Customer"
        subtitle={subtitle}
        navItems={navItems}
        userName={userName}
        userEmail={userEmail}
        homeHref="/dashboard"
        companyName={companyName}
        brand={brand}
      >
        {children}
      </AppShell>
    </div>
  );
}
