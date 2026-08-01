import Link from "next/link";
import { Plus } from "lucide-react";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { CustomerTable } from "@/components/admin/customer-table";
import { CustomerSearch } from "@/components/admin/filters";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { getCustomers } from "@/lib/admin/queries";

type SearchParams = Promise<{ q?: string }>;

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = params.q?.trim() ?? "";

  let customers = null;
  let errorMessage: string | null = null;

  try {
    customers = await getCustomers(search);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load customers.";
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Customers" },
        ]}
      />
      <PageHeader
        title="Customers"
        description="Customers belong to your company and are created by admins only."
        actions={
          <Button asChild>
            <Link href="/admin/customers/new">
              <Plus className="size-4" aria-hidden />
              Create Customer
            </Link>
          </Button>
        }
      />

      <CustomerSearch search={search} />

      {errorMessage ? (
        <ErrorState title="Could not load customers" description={errorMessage} />
      ) : customers ? (
        customers.length === 0 && search ? (
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
            <h2 className="text-base font-semibold">No matching customers found.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different name or email.
            </p>
          </div>
        ) : (
          <CustomerTable customers={customers} />
        )
      ) : null}
    </div>
  );
}
