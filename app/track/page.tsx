import type { Metadata } from "next";

import { BrandTheme } from "@/components/branding/brand-theme";
import {
  PublicFooter,
  PublicHeader,
} from "@/components/layout/public-chrome";
import { TrackingLookup } from "@/components/tracking/tracking-lookup";
import { getRequestTenantContext } from "@/lib/domains/resolve";

export const dynamic = "force-dynamic";

type TrackPageProps = {
  searchParams: Promise<{ number?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getRequestTenantContext();
  const name = ctx.tenant?.company_name;
  return {
    title: name ? `${name} — Track Delivery` : "Track delivery",
    description: name
      ? `Track a ${name} delivery`
      : "Track a delivery by tracking number",
  };
}

export default async function TrackPage({ searchParams }: TrackPageProps) {
  const params = await searchParams;
  const ctx = await getRequestTenantContext();

  const content = (
    <div className="flex min-h-screen flex-col">
      <PublicHeader brand={ctx.isCustomDomain ? ctx.brand : null} />
      <main className="flex-1 px-4 py-10 md:px-6 md:py-14">
        <TrackingLookup
          number={params.number}
          initialBrandName={ctx.tenant?.company_name ?? null}
        />
      </main>
      <PublicFooter brand={ctx.isCustomDomain ? ctx.brand : null} />
    </div>
  );

  if (ctx.isCustomDomain) {
    return <BrandTheme brand={ctx.brand}>{content}</BrandTheme>;
  }

  return content;
}
