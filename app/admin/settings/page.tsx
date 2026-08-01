import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";

export default async function AdminSettingsPage() {
  const { profile } = await getSessionUser();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Settings" },
        ]}
      />
      <PageHeader
        title="Settings"
        description="Company branding is managed by the platform Master Admin. Custom domains are not available yet."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Signed in as</CardTitle>
          <CardDescription>Loaded from your Supabase profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name:</span>{" "}
            {profile?.full_name}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span>{" "}
            {profile?.email}
          </p>
          <p>
            <span className="text-muted-foreground">Role:</span> {profile?.role}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
