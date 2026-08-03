"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function MasterAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Master Admin error", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Application Hub error
        </h1>
        <p className="text-sm text-muted-foreground">
          Something failed while loading the Master Admin console.
        </p>
        {error?.message ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-left font-mono text-xs text-foreground">
            {error.message}
          </p>
        ) : null}
        {error?.digest ? (
          <p className="text-xs text-muted-foreground">Digest: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={reset}>
          Try Again
        </Button>
        <Button asChild variant="outline">
          <Link href="/master-admin/login">Back to Master login</Link>
        </Button>
      </div>
    </div>
  );
}
