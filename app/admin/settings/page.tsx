import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PageHeader } from "@/components/admin/page-header";
import { ChangePasswordForm } from "@/components/customer/change-password-form";
import { UpdateLoginEmailForm } from "@/components/admin/update-login-email-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { getDefaultMailbox } from "@/lib/email/mailbox";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage() {
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const mailbox = profile?.company_id
    ? await getDefaultMailbox(supabase, profile.company_id)
    : null;

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
        description="Update your login email and password after first sign-in with temporary credentials."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Signed in as</CardTitle>
          <CardDescription>Loaded from your account profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name:</span>{" "}
            {profile?.full_name}
          </p>
          <p>
            <span className="text-muted-foreground">Login email:</span>{" "}
            {profile?.email}
          </p>
          <p>
            <span className="text-muted-foreground">Role:</span> {profile?.role}
          </p>
          <p>
            <span className="text-muted-foreground">Company mailbox:</span>{" "}
            {mailbox?.full_address ?? (
              <span className="text-amber-700">
                Not allocated yet — contact support or re-run Deploy.
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      <UpdateLoginEmailForm currentEmail={profile?.email ?? ""} />
      <ChangePasswordForm />
    </div>
  );
}
