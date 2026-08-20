import type { Metadata } from "next";

import { BrandTheme } from "@/components/branding/brand-theme";
import { LoginForm } from "@/components/auth/login-form";
import { getRequestTenantContext } from "@/lib/domains/resolve";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getRequestTenantContext();
  if (ctx.tenant) {
    return {
      title: `Sign in · ${ctx.tenant.company_name}`,
      icons: ctx.brand.faviconUrl
        ? [{ url: ctx.brand.faviconUrl }]
        : undefined,
    };
  }
  return { title: "Sign in" };
}

export default async function LoginPage() {
  const ctx = await getRequestTenantContext();

  const companyName = ctx.tenant?.company_name ?? null;
  // Never show platform white-label marketing copy on tenant login.
  const tagline =
    ctx.tenant && ctx.brand.tagline !== "White-label delivery platform for logistics operators."
      ? ctx.brand.tagline
      : companyName
        ? `Sign in to ${companyName}`
        : "Sign in to your account";

  const inner = (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfdf5_0%,_#eef2f6_45%,_#f4f6f8_100%)] px-4 py-10">
      <LoginForm
        brand={ctx.tenant ? ctx.brand : null}
        companyName={companyName}
        tagline={tagline}
      />
    </div>
  );

  if (ctx.tenant) {
    return <BrandTheme brand={ctx.brand}>{inner}</BrandTheme>;
  }

  return inner;
}
