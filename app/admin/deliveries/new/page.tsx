import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { DeliveryForm } from "@/components/admin/delivery-form";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/common/states";
import { getCustomerOptions } from "@/lib/admin/queries";

export default async function NewDeliveryPage() {
  let customers = [] as Array<{ id: string; full_name: string; email: string }>;
  let errorMessage: string | null = null;

  try {
    customers = await getCustomerOptions();
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load customers.";
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Deliveries", href: "/admin/deliveries" },
          { label: "Create" },
        ]}
      />
      <PageHeader
        title="Create delivery"
        description="Define the customer, parcel details, and full stop route. Tracking numbers are generated automatically."
      />

      {errorMessage ? (
        <ErrorState title="Could not load form data" description={errorMessage} />
      ) : (
        <DeliveryForm customers={customers} />
      )}
    </div>
  );
}
