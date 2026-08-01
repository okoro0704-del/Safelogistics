import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";

export default async function SuspendedPage() {
  const { company, profile } = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <BrandMark href="/login" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Company suspended
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {company?.name
            ? `${company.name} is currently suspended.`
            : "Your company is currently suspended."}{" "}
          Contact the platform operator if you believe this is a mistake.
          {profile?.email ? ` Signed in as ${profile.email}.` : ""}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <form action={signOutAction}>
          <Button type="submit">Sign out</Button>
        </form>
        <Button asChild variant="outline">
          <Link href="/track">Track a delivery</Link>
        </Button>
      </div>
    </div>
  );
}
