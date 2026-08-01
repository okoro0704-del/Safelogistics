import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";

export default async function ComingSoonPage() {
  const { user, profile } = await getSessionUser();

  if (!user || !profile) {
    redirect("/login");
  }

  if (profile.role !== "master_admin") {
    redirect(profile.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-8">
        <BrandMark href="/" />
      </div>
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Master Admin coming soon</CardTitle>
          <CardDescription>
            Your account has the reserved <code>master_admin</code> role. The
            multi-tenant control plane is not available in this phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Signed in as {profile.full_name} ({profile.email})
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline">
              <Link href="/">Go to landing</Link>
            </Button>
            <form action={signOutAction}>
              <Button type="submit" variant="secondary">
                Logout
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
