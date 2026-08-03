import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { CompanySettingsEditor } from "@/components/master-admin/company-settings-editor";
import { Button } from "@/components/ui/button";
import { getCompanyDetail, getCompanySettings } from "@/lib/master-admin/queries";

export default async function CompanySettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();

  const settings = await getCompanySettings(id);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Companies", href: "/master-admin/companies" },
          { label: detail.company.name, href: `/master-admin/companies/${id}` },
          { label: "Settings" },
        ]}
      />
      <PageHeader
        title="App settings"
        description={detail.company.name}
        actions={
          <Button asChild variant="outline">
            <Link href={`/master-admin/companies/${id}`}>Back to company</Link>
          </Button>
        }
      />
      <CompanySettingsEditor
        companyId={id}
        companyName={detail.company.name}
        initial={settings}
      />
    </div>
  );
}
