import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { BrandingEditor } from "@/components/master-admin/branding-editor";
import { getCompanyBranding } from "@/lib/branding/server";
import { getCompanyDetail } from "@/lib/master-admin/queries";

export default async function CompanyBrandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();

  const branding = await getCompanyBranding(id);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Companies", href: "/master-admin/companies" },
          {
            label: detail.company.name,
            href: `/master-admin/companies/${id}`,
          },
          { label: "Branding" },
        ]}
      />
      <PageHeader
        title="Branding"
        description={`White-label appearance for ${detail.company.name}. Custom domains are not configured yet.`}
        actions={
          <Link
            href={`/master-admin/companies/${id}`}
            className="text-sm text-primary hover:underline"
          >
            Back to company
          </Link>
        }
      />
      <BrandingEditor
        companyId={id}
        companyName={detail.company.name}
        companySlug={detail.company.slug}
        initial={branding}
      />
    </div>
  );
}
