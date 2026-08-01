import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { CustomerForm } from "@/components/admin/customer-form";
import { PageHeader } from "@/components/admin/page-header";

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Customers", href: "/admin/customers" },
          { label: "Create" },
        ]}
      />
      <PageHeader
        title="Create customer"
        description="Creates an Auth account and profile for your company. Share credentials securely with the customer."
      />
      <CustomerForm />
    </div>
  );
}
