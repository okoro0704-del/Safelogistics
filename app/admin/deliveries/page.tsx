import Link from "next/link";
import { Plus } from "lucide-react";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import {
  DeliveryEmptyWithLink,
  DeliveryTable,
} from "@/components/admin/delivery-table";
import { DeliveryFilters } from "@/components/admin/filters";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { getDeliveries } from "@/lib/admin/queries";
import type { DeliveryStatus } from "@/lib/types/database";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  page?: string;
}>;

export default async function AdminDeliveriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const statusParam = params.status;
  const status =
    statusParam && statusParam !== "all"
      ? (statusParam as DeliveryStatus)
      : "all";
  const page = Number(params.page ?? "1") || 1;

  let result = null;
  let errorMessage: string | null = null;

  try {
    result = await getDeliveries({
      search,
      status,
      page,
      pageSize: 20,
    });
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load deliveries.";
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Deliveries" },
        ]}
      />
      <PageHeader
        title="Deliveries"
        description="Search, filter, and manage shipments for your company."
        actions={
          <Button asChild>
            <Link href="/admin/deliveries/new">
              <Plus className="size-4" aria-hidden />
              Create Delivery
            </Link>
          </Button>
        }
      />

      <DeliveryFilters search={search} status={status} />

      {errorMessage ? (
        <ErrorState title="Could not load deliveries" description={errorMessage} />
      ) : result && result.deliveries.length > 0 ? (
        <>
          <DeliveryTable deliveries={result.deliveries} />
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              Showing page {result.page} of {totalPages} · {result.total} total
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/admin/deliveries?${new URLSearchParams({
                      ...(search ? { q: search } : {}),
                      ...(status !== "all" ? { status } : {}),
                      page: String(page - 1),
                    }).toString()}`}
                  >
                    Previous
                  </Link>
                </Button>
              ) : null}
              {page < totalPages ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/admin/deliveries?${new URLSearchParams({
                      ...(search ? { q: search } : {}),
                      ...(status !== "all" ? { status } : {}),
                      page: String(page + 1),
                    }).toString()}`}
                  >
                    Next
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <DeliveryEmptyWithLink
          title={
            search || status !== "all"
              ? "No matching deliveries found."
              : "No deliveries yet."
          }
          description={
            search || status !== "all"
              ? "Try clearing filters or adjusting your search."
              : "Create your first delivery to start tracking parcels."
          }
          href="/admin/deliveries/new"
          label="Create Delivery"
        />
      )}
    </div>
  );
}
