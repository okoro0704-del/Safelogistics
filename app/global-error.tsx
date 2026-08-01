"use client";

import { useEffect } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
          <BrandMark />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Something went wrong
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Please try again. If the problem continues, return home and sign
              in again.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={reset}>
              Try Again
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Go to Home</Link>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
