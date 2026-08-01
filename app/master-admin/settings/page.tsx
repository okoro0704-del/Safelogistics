import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function MasterAdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform settings"
        description="Platform-wide preferences. Tenant domains and offline payments are managed per company."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Platform notes</CardTitle>
          <CardDescription>
            There are no plans or subscriptions. Offline payment records live
            under Payments. Domains and DNS are available under each company.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tenant isolation is enforced in Postgres RLS and privileged RPCs.
        </CardContent>
      </Card>
    </div>
  );
}
