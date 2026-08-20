import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Quote } from "lucide-react";

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
 * Tenant branded landing (apex / apps / custom domains).
 * Platform host (e.g. pm.webfinance.app) redirects `/` → Application Hub via middleware.
 */
export default async function LandingPage() {
  const ctx = await getRequestTenantContext();

  if (!ctx.tenant) {
    redirect("/login");
  }

  const displayName = ctx.tenant.company_name;

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
                Manage deliveries, monitor progress, and keep customers informed
                in real time — without exposing private account data.
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
            <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
              <div className="mb-8 max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                  Customer stories
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  Delivered when promised
                </h2>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                  Customers who got their parcels on time — and knew where they
                  were every step of the way.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {[
                  {
                    quote:
                      "My package arrived the morning they promised. I checked tracking the night before and every stop lined up — no guessing, no delays.",
                    name: "Jessica Harper",
                    detail: "American customer · received on time",
                  },
                  {
                    quote:
                      "I needed documents for a client meeting in London. They landed in the window they gave me, and I could share the live route with the office.",
                    name: "James Hartley",
                    detail: "British customer · received on time",
                  },
                  {
                    quote:
                      "We were waiting on parts in Berlin. The timeline stayed clear the whole way, and delivery came exactly when expected.",
                    name: "Lena Hoffmann",
                    detail: "German customer · received on time",
                  },
                ].map((item) => (
                  <figure
                    key={item.name}
                    className="flex h-full flex-col rounded-xl border border-border/80 bg-background/80 p-5 shadow-sm"
                  >
                    <Quote className="size-5 text-primary/70" aria-hidden />
                    <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground">
                      “{item.quote}”
                    </blockquote>
                    <figcaption className="mt-4 border-t border-border/60 pt-3">
                      <p className="text-sm font-semibold text-foreground">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        </main>
        <PublicFooter brand={ctx.brand} />
      </div>
    </BrandTheme>
  );
}
