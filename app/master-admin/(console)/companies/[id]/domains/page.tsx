import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyDomainsManager } from "@/components/master-admin/company-domains-manager";
import { Button } from "@/components/ui/button";
import type { CompanyDomain } from "@/lib/domains/normalize";
import { getCompanyDetail } from "@/lib/master-admin/queries";
import { createClient } from "@/lib/supabase/server";

export default async function CompanyDomainsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("company_domains")
    .select("*")
    .eq("company_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Master Admin", href: "/master-admin" },
          { label: "Companies", href: "/master-admin/companies" },
          { label: detail.company.name, href: `/master-admin/companies/${id}` },
          { label: "Domains" },
        ]}
      />
      <PageHeader
        title="Custom domains"
        description={detail.company.name}
        actions={
          <Button asChild variant="outline">
            <Link href={`/master-admin/companies/${id}`}>Back to company</Link>
          </Button>
        }
      />
      <CompanyDomainsManager
        companyId={id}
        initialDomains={(data as CompanyDomain[] | null) ?? []}
      />
    </div>
  );
}
