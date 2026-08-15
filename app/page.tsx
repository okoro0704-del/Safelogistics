import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MapPinned, ShieldCheck, Truck } from "lucide-react";

import { BrandTheme } from "@/components/branding/brand-theme";
import {
  PublicFooter,
  PublicHeader,
} from "@/components/layout/public-chrome";
import { TrackingForm } from "@/components/tracking/tracking-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRequestTenantContext } from "@/lib/domains/resolve";

export const dynamic = "force-dynamic";

/**
 * Tenant white-label landing (custom domains only).
 * Platform host (e.g. pm.webfinance.app) redirects `/` → Application Hub.
 */
export default async function LandingPage() {
  const ctx = await getRequestTenantContext();

  if (!ctx.isCustomDomain || !ctx.tenant) {
    redirect("/master-admin");
  }

  const displayName = ctx.tenant.company_name;
  const tagline = ctx.brand.tagline;

  return (
    <BrandTheme brand={ctx.brand}>
      <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f4f6f8_45%,_#eef2f6_100%)]">
        <PublicHeader brand={ctx.brand} />
        <main className="flex-1">
          <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.15fr_0.85fr] md:items-center md:px-6 md:py-20">
            <div className="space-y-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                {displayName}
              </p>
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                Track every delivery.
                <span className="mt-2 block text-primary">
                  Move every shipment with confidence.
                </span>
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
                {tagline} Manage deliveries, monitor progress, and keep
                customers informed in real time — without exposing private
                account data.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/track">
                    Track a delivery
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </div>

            <Card className="border-border/80 shadow-md">
              <CardHeader>
                <CardTitle>Quick track</CardTitle>
                <CardDescription>
                  Enter a tracking number to view live status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrackingForm />
              </CardContent>
            </Card>
          </section>

          <section className="border-t border-border/70 bg-card/60">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3 md:px-6">
              {[
                {
                  icon: Truck,
                  title: "Admin-controlled movement",
                  body: "Parcels advance only when an admin proceeds — no GPS auto-updates.",
                },
                {
                  icon: MapPinned,
                  title: "Live route visibility",
                  body: "Customers and public trackers see the same stop timeline and map.",
                },
                {
                  icon: ShieldCheck,
                  title: "Tenant isolation",
                  body: "Each company stays separated by Postgres RLS — branding and domains included.",
                },
              ].map((item) => (
                <div key={item.title} className="space-y-3">
                  <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="size-5" aria-hidden />
                  </div>
                  <h2 className="text-base font-semibold">{item.title}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>
        <PublicFooter brand={ctx.brand} />
      </div>
    </BrandTheme>
  );
}
