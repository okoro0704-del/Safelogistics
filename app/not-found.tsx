import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";

export default async function NotFound() {
  const { profile } = await getSessionUser();
  const home =
    profile?.role === "admin"
      ? "/admin"
      : profile?.role === "customer"
        ? "/dashboard"
        : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <BrandMark href={home} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Page Not Found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have been
          moved.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={home}>
            {profile ? "Go to Dashboard" : "Go to Home"}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/track">Track a delivery</Link>
        </Button>
      </div>
    </div>
  );
}
