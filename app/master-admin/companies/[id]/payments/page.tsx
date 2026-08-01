import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyPaymentControls } from "@/components/master-admin/company-payment-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatMoneyCents,
  PAYMENT_METHOD_LABELS,
} from "@/lib/payments/constants";
import {
  getCompanyPaymentTotals,
  listCompanyPayments,
} from "@/lib/payments/server";
import { getCompanyDetail } from "@/lib/master-admin/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CompanyPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();

  const { company } = detail;
  const [payments, totals] = await Promise.all([
    listCompanyPayments(id),
    getCompanyPaymentTotals(id),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Companies", href: "/master-admin/companies" },
          { label: company.name, href: `/master-admin/companies/${company.id}` },
          { label: "Payments" },
        ]}
      />
      <PageHeader
        title={`${company.name} · Payments`}
        description="Manual offline payment records. The platform does not process online payments."
        actions={
          <Button asChild variant="outline">
            <Link href={`/master-admin/companies/${company.id}`}>
              Company overview
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total payments</CardDescription>
            <CardTitle className="text-xl">{totals.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total received</CardDescription>
            <CardTitle className="text-xl">
              {formatMoneyCents(totals.total_cents, totals.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last payment</CardDescription>
            <CardTitle className="text-xl">
              {totals.last_payment
                ? formatMoneyCents(
                    totals.last_payment.amount_cents,
                    totals.last_payment.currency,
                  )
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Record / manage</h2>
        <CompanyPaymentControls
          companyId={company.id}
          companyName={company.name}
          payments={payments}
          defaultCurrency={totals.currency}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payment history</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoneyCents(p.amount_cents, p.currency)}
                    </td>
                    <td className="px-4 py-3">
                      {PAYMENT_METHOD_LABELS[p.payment_method]}
                    </td>
                    <td className="px-4 py-3">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {p.reference || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          p.status === "recorded" ? "success" : "warning"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
