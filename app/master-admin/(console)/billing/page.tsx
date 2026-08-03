import Link from "next/link";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  formatMoneyCents,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
} from "@/lib/payments/constants";
import { listAllPayments } from "@/lib/payments/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
  method?: string;
  search?: string;
}>;

type PaymentStats = {
  total_payments: number;
  total_received_cents: number;
  received_month_cents: number;
  voided_payments: number;
};

export default async function MasterPaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = params.status ?? "all";
  const method = params.method ?? "all";
  const search = params.search ?? "";

  let stats: PaymentStats | null = null;
  let payments = null;
  let errorMessage: string | null = null;

  try {
    const supabase = await createClient();
    const [{ data, error }, paymentRows] = await Promise.all([
      supabase.rpc("master_payment_stats"),
      listAllPayments({ status, method, search }),
    ]);
    if (error) throw new Error(error.message);
    stats = data as PaymentStats;
    payments = paymentRows;
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load payments.";
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Payments" },
        ]}
      />
      <PageHeader
        title="Payment records"
        description="Manual offline payments recorded by the Master Admin. The platform does not process online payments and does not use plans or subscriptions."
      />

      {errorMessage ? (
        <ErrorState title="Could not load payments" description={errorMessage} />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total payments</CardDescription>
              <CardTitle className="text-xl">{stats.total_payments}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total amount received</CardDescription>
              <CardTitle className="text-xl">
                {formatMoneyCents(Number(stats.total_received_cents))}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Payments this month</CardDescription>
              <CardTitle className="text-xl">
                {formatMoneyCents(Number(stats.received_month_cents))}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payment history</h2>
        <Suspense fallback={null}>
          <form
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end"
            method="get"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="pay-search">Search</Label>
              <Input
                id="pay-search"
                name="search"
                defaultValue={search}
                placeholder="Company, reference, notes"
              />
            </div>
            <div className="space-y-2 sm:w-40">
              <Label htmlFor="pay-status">Status</Label>
              <select
                id="pay-status"
                name="status"
                defaultValue={status}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All</option>
                <option value="recorded">Recorded</option>
                <option value="voided">Voided</option>
              </select>
            </div>
            <div className="space-y-2 sm:w-44">
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                name="method"
                defaultValue={method}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Filter</Button>
            <Button asChild type="button" variant="outline">
              <Link href="/master-admin/billing">Clear</Link>
            </Button>
          </form>
        </Suspense>

        {payments && payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments found.</p>
        ) : payments ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/master-admin/companies/${p.company_id}/payments`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.company_name ?? p.company_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoneyCents(p.amount_cents, p.currency)}
                    </td>
                    <td className="px-4 py-3">
                      {PAYMENT_METHOD_LABELS[p.payment_method]}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(p.payment_date)}
                    </td>
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
        ) : null}
      </section>
    </div>
  );
}
