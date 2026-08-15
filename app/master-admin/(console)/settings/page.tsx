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
        description="Platform-wide preferences. Tenant domains and branding are managed per company."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Platform notes</CardTitle>
          <CardDescription>
            Parcel Movement has no plans, subscriptions, or in-app billing.
            Automatic tenant hosts use {"{slug}"}.apps.webfinance.app. Custom
            domains remain available under each company.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tenant isolation is enforced in Postgres RLS and privileged RPCs.
        </CardContent>
      </Card>
    </div>
  );
}
