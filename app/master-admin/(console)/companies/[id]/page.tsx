import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyStatusControls } from "@/components/master-admin/company-status-controls";
import { CreateAdminForm } from "@/components/master-admin/create-admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatMoneyCents,
} from "@/lib/payments/constants";
import {
  getCompanyPaymentTotals,
} from "@/lib/payments/server";
import { getCompanyBranding } from "@/lib/branding/server";
import {
  getCompanyDetail,
  getCompanySettings,
} from "@/lib/master-admin/queries";
import { formatDate } from "@/lib/format";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();

  const { company, admins } = detail;
  const [branding, settings, paymentTotals] = await Promise.all([
    getCompanyBranding(id),
    getCompanySettings(id),
    getCompanyPaymentTotals(id),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Companies", href: "/master-admin/companies" },
          { label: company.name },
        ]}
      />
      <PageHeader
        title={company.name}
        description={`Slug: ${company.slug}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {company.status === "active" ? (
              <Button asChild variant="secondary">
                <Link href={`/t/${company.slug}`} target="_blank">
                  Open preview
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/master-admin/companies/${company.id}/branding`}>
                Branding
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/master-admin/companies/${company.id}/settings`}>
                Settings
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/master-admin/companies/${company.id}/domains`}>
                Domains
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/master-admin/companies/${company.id}/payments`}>
                Payments
              </Link>
            </Button>
            <CompanyStatusControls
              companyId={company.id}
              companyName={company.name}
              status={company.status}
            />
          </div>
        }
      />

      <nav
        className="flex flex-wrap gap-2 text-sm"
        aria-label="Company sections"
      >
        {[
          { href: `#overview`, label: "Overview" },
          {
            href: `/master-admin/companies/${company.id}/branding`,
            label: "Branding",
          },
          {
            href: `/master-admin/companies/${company.id}/settings`,
            label: "Settings",
          },
          {
            href: `/master-admin/companies/${company.id}/domains`,
            label: "Domains",
          },
          {
            href: `/master-admin/companies/${company.id}/payments`,
            label: "Payments",
          },
          { href: `#admins`, label: "Admins" },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div id="overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Status", value: company.status },
          { label: "Admins", value: String(admins.length) },
          { label: "Customers", value: String(detail.customer_count) },
          {
            label: "Deliveries",
            value: `${detail.delivery_count} (${detail.active_delivery_count} active)`,
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-xl capitalize">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Payment summary</CardTitle>
            <CardDescription>
              Offline payments recorded by the Master Admin.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/master-admin/companies/${company.id}/payments`}>
              Payment history
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Last payment
            </p>
            <p className="mt-1 font-medium">
              {paymentTotals.last_payment
                ? formatMoneyCents(
                    paymentTotals.last_payment.amount_cents,
                    paymentTotals.last_payment.currency,
                  )
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total payments
            </p>
            <p className="mt-1 font-medium">{paymentTotals.count}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total amount received
            </p>
            <p className="mt-1 font-medium">
              {formatMoneyCents(
                paymentTotals.total_cents,
                paymentTotals.currency,
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <Badge
                className="mt-1"
                variant={company.status === "active" ? "success" : "warning"}
              >
                {company.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Created
              </p>
              <p className="mt-1 font-medium">{formatDate(company.created_at)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <p className="mt-1 font-medium">
                {company.description || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Email
              </p>
              <p className="mt-1 font-medium">{company.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Phone
              </p>
              <p className="mt-1 font-medium">{company.phone || "—"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
            <CardDescription>
              White-label appearance for this tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Logo:</span>{" "}
              {branding?.logo_url ? "Custom" : "Platform default"}
            </p>
            <p>
              <span className="text-muted-foreground">Colors:</span>{" "}
              {branding?.primary_color ? "Custom" : "Platform default"}
            </p>
            <p>
              <span className="text-muted-foreground">Tagline:</span>{" "}
              {branding?.tagline
                ? `"${branding.tagline}"`
                : "Platform default"}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/master-admin/companies/${company.id}/branding`}>
                Edit Branding
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription>
              Timezone, currency, and support contacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Timezone:</span>{" "}
              {settings?.timezone ?? "Africa/Lagos"}
            </p>
            <p>
              <span className="text-muted-foreground">Currency:</span>{" "}
              {settings?.currency ?? "NGN"}
            </p>
            <p>
              <span className="text-muted-foreground">Support:</span>{" "}
              {settings?.support_email || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Website:</span>{" "}
              {settings?.website_url || "—"}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/master-admin/companies/${company.id}/settings`}>
                Edit Settings
              </Link>
            </Button>
          </CardContent>
        </Card>

        <CreateAdminForm companyId={company.id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom domains</CardTitle>
          <CardDescription>
            Map verified hostnames to this tenant. Automatic DNS is not
            configured yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href={`/master-admin/companies/${company.id}/domains`}>
              Manage Domains
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card id="admins">
        <CardHeader>
          <CardTitle className="text-base">Administrators</CardTitle>
          <CardDescription>
            Company admins for this tenant. Credentials are never shown again
            after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admins yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {admins.map((admin) => (
                <li
                  key={admin.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{admin.full_name}</p>
                    <p className="text-muted-foreground">{admin.email}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Joined {formatDate(admin.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
