import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { CreateAppWizard } from "@/components/master-admin/create-app-wizard";

export const dynamic = "force-dynamic";

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Companies", href: "/master-admin/companies" },
          { label: "Create App" },
        ]}
      />
      <PageHeader
        title="Create New App"
        description="Provision a white-label tenant with optional offline payment record."
      />
      <CreateAppWizard />
    </div>
  );
}
