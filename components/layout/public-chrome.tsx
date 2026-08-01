import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/lib/branding";
import { PLATFORM_DEFAULTS } from "@/lib/branding";

export function PublicHeader({ brand }: { brand?: ResolvedBrand | null }) {
  const resolved = brand ?? null;
  return (
    <header className="border-b border-border/80 bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <BrandMark brand={resolved ?? undefined} />
        <nav className="flex items-center gap-2" aria-label="Public">
          <Button asChild variant="ghost">
            <Link href="/track">Track</Link>
          </Button>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter({ brand }: { brand?: ResolvedBrand | null }) {
  const name = brand?.displayName ?? PLATFORM_DEFAULTS.appName;
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <p>
          © {new Date().getFullYear()} {name}. Delivery operations platform.
        </p>
        <div className="flex gap-4">
          <Link href="/track" className="hover:text-foreground">
            Track a delivery
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Customer / Admin login
          </Link>
        </div>
      </div>
    </footer>
  );
}
