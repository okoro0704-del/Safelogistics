import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyFilters } from "@/components/master-admin/company-filters";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCompanies } from "@/lib/master-admin/queries";
import { formatDate } from "@/lib/format";
import type { CompanyStatus } from "@/lib/types/database";

type SearchParams = Promise<{ q?: string; status?: string }>;

export default async function MasterCompaniesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const statusParam = params.status ?? "all";
  const status =
    statusParam === "active" || statusParam === "suspended"
      ? (statusParam as CompanyStatus)
      : "all";

  let companies = null;
  let errorMessage: string | null = null;

  try {
    companies = await listCompanies({ search, status });
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load companies.";
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Companies" },
        ]}
      />
      <PageHeader
        title="Apps"
        description="Each company is an isolated white-label delivery tenant."
        actions={
          <Button asChild>
            <Link href="/master-admin/companies/new">
              <Plus className="size-4" aria-hidden />
              Create New App
            </Link>
          </Button>
        }
      />

      <Suspense fallback={null}>
        <CompanyFilters search={search} status={statusParam} />
      </Suspense>

      {errorMessage ? (
        <ErrorState title="Could not load companies" description={errorMessage} />
      ) : companies && companies.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
          <h2 className="text-base font-semibold">
            {search || status !== "all" ? "No companies found." : "No companies yet."}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || status !== "all"
              ? "Try a different name, slug, or status filter."
              : "Create a company to provision its first administrator."}
          </p>
        </div>
      ) : companies ? (
        <>
          <div className="grid gap-3 md:hidden">
            {companies.map((company) => (
              <article
                key={company.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{company.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {company.slug}
                    </p>
                  </div>
                  <Badge
                    variant={company.status === "active" ? "success" : "warning"}
                  >
                    {company.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {company.admin_count} admins · {company.customer_count}{" "}
                  customers · {company.delivery_count} deliveries
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link href={`/master-admin/companies/${company.id}`}>
                    View
                  </Link>
                </Button>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Users</th>
                  <th className="px-4 py-3 font-medium">Deliveries</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/master-admin/companies/${company.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {company.name}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">
                        {company.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          company.status === "active" ? "success" : "warning"
                        }
                      >
                        {company.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {company.admin_count} admins · {company.customer_count}{" "}
                      customers
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {company.delivery_count}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(company.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/master-admin/companies/${company.id}`}>
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
