import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPlatformStats, listCompanies } from "@/lib/master-admin/queries";
import { formatDate } from "@/lib/format";

export default async function MasterAdminDashboardPage() {
  let statsError: string | null = null;
  let listError: string | null = null;
  let stats = null;
  let recent = null;

  try {
    stats = await getPlatformStats();
  } catch (error) {
    statsError =
      error instanceof Error ? error.message : "Unable to load platform stats.";
  }

  try {
    recent = await listCompanies();
  } catch (error) {
    listError =
      error instanceof Error ? error.message : "Unable to load companies.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Application Hub"
        description="Create and manage every white-label delivery app (tenant) from one place."
        actions={
          <Button asChild>
            <Link href="/master-admin/companies/new">
              <Plus className="size-4" aria-hidden />
              Create New App
            </Link>
          </Button>
        }
      />

      {statsError ? (
        <ErrorState title="Could not load stats" description={statsError} />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { label: "Total Apps", value: stats.companies },
            { label: "Active Apps", value: stats.active_companies },
            { label: "Suspended Apps", value: stats.suspended_companies },
            { label: "Total Customers", value: stats.total_customers },
            { label: "Total Deliveries", value: stats.total_deliveries },
            { label: "Active Deliveries", value: stats.active_deliveries },
          ].map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {card.value}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Apps</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/master-admin/companies">View all</Link>
          </Button>
        </div>

        {listError ? (
          <ErrorState title="Could not load companies" description={listError} />
        ) : recent && recent.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">App</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Deliveries</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.slice(0, 8).map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{company.name}</p>
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
                    <td className="px-4 py-3 tabular-nums">
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
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No apps yet. Create the first white-label tenant to begin.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
