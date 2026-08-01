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

  const inner = (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfdf5_0%,_#eef2f6_45%,_#f4f6f8_100%)] px-4 py-10">
      <LoginForm
        brand={ctx.isCustomDomain ? ctx.brand : null}
        companyName={ctx.tenant?.company_name ?? null}
        tagline={ctx.isCustomDomain ? ctx.brand.tagline : null}
      />
    </div>
  );

  if (ctx.isCustomDomain) {
    return <BrandTheme brand={ctx.brand}>{inner}</BrandTheme>;
  }

  return inner;
}
