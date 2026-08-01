import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";

export default async function UnauthorizedPage() {
  const { profile } = await getSessionUser();
  const home =
    profile?.role === "admin"
      ? "/admin"
      : profile?.role === "customer"
        ? "/dashboard"
        : "/login";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <BrandMark href={home === "/login" ? "/" : home} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Access Restricted
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
      </div>
      <Button asChild>
        <Link href={home}>
          {profile ? "Return to Dashboard" : "Sign in"}
        </Link>
      </Button>
    </div>
  );
}
