import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { CustomerDeliverySearch } from "@/components/customer/customer-delivery-search";
import { CustomerDeliveryTable } from "@/components/customer/customer-delivery-table";
import { ErrorState } from "@/components/common/states";
import { getCustomerDeliveries } from "@/lib/customer/queries";

type SearchParams = Promise<{ q?: string }>;

export default async function CustomerDeliveriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = params.q?.trim() ?? "";

  let deliveries = null;
  let errorMessage: string | null = null;

  try {
    deliveries = await getCustomerDeliveries(search);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load deliveries.";
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "My Deliveries" },
        ]}
      />
      <PageHeader
        title="My Deliveries"
        description="Track shipments assigned to your account."
      />

      <CustomerDeliverySearch search={search} />

      {errorMessage ? (
        <ErrorState
          title="Unable to load deliveries"
          description={errorMessage}
        />
      ) : deliveries && deliveries.length > 0 ? (
        <CustomerDeliveryTable deliveries={deliveries} />
      ) : (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
          <h2 className="text-base font-semibold">
            {search ? "No matching deliveries found." : "No Deliveries Yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {search
              ? "Try a different tracking number."
              : "You don't have any deliveries assigned to your account yet. Your deliveries will appear here once an administrator creates one for you."}
          </p>
        </div>
      )}
    </div>
  );
}
