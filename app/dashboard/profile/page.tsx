import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { ChangePasswordForm } from "@/components/customer/change-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export default async function CustomerProfilePage() {
  const { profile } = await getSessionUser();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Profile" },
        ]}
      />
      <PageHeader
        title="Profile"
        description="Your account details. Contact your delivery company to update identity fields."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Account information (read-only)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Full name
            </p>
            <p className="mt-1 font-medium">{profile?.full_name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Email
            </p>
            <p className="mt-1 font-medium">{profile?.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Phone
            </p>
            <p className="mt-1 font-medium">
              {profile?.phone || "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Member since
            </p>
            <p className="mt-1 font-medium">
              {formatDate(profile?.created_at)}
            </p>
          </div>
        </CardContent>
      </Card>

      <ChangePasswordForm />
    </div>
  );
}
