"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";

import { BrandTheme } from "@/components/branding/brand-theme";
import { BrandMark } from "@/components/layout/brand-mark";
import { SidebarNav, type NavItem } from "@/components/navigation/sidebar-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import type { ResolvedBrand } from "@/lib/branding";
import { getInitials } from "@/lib/utils";

type AppShellProps = {
  title: string;
  subtitle?: string;
  navItems: NavItem[];
  userName: string;
  userEmail: string;
  homeHref: string;
  companyName?: string | null;
  brand?: ResolvedBrand | null;
  variant?: "tenant" | "platform";
  children: React.ReactNode;
};

export function AppShell({
  title,
  subtitle,
  navItems,
  userName,
  userEmail,
  homeHref,
  companyName,
  brand,
  variant = "tenant",
  children,
}: AppShellProps) {
  const [open, setOpen] = useState(false);
  const displayCompany = brand?.displayName || companyName;

  const shell = (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar p-4 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col gap-6">
          <div className="flex items-center justify-between gap-2">
            <BrandMark href={homeHref} inverted brand={brand} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-sidebar-foreground lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </Button>
          </div>

          {variant === "platform" ? (
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-sidebar-muted">
              Platform control
            </p>
          ) : brand?.tagline ? (
            <p className="truncate px-1 text-xs text-sidebar-muted">
              {brand.tagline}
            </p>
          ) : displayCompany ? (
            <p className="truncate px-1 text-xs font-medium uppercase tracking-wide text-sidebar-muted">
              {displayCompany}
            </p>
          ) : null}

          <SidebarNav items={navItems} />

          <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
            <div className="flex items-center gap-3 px-1">
              <Avatar>
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {userName}
                </p>
                <p className="truncate text-xs text-sidebar-muted">{userEmail}</p>
              </div>
            </div>
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="sidebar"
                className="text-sidebar-muted hover:text-sidebar-foreground"
              >
                <LogOut className="size-4" aria-hidden />
                Logout
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close menu overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {subtitle ?? title}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {displayCompany && variant !== "platform"
                  ? `${displayCompany} · ${title}`
                  : title}
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href={homeHref}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {userName}
            </Link>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );

  if (!brand) return shell;
  return <BrandTheme brand={brand}>{shell}</BrandTheme>;
}
