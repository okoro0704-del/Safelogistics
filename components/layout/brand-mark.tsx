import Link from "next/link";
import { Package } from "lucide-react";

import { PLATFORM_DEFAULTS, type ResolvedBrand } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function BrandMark({
  href = "/",
  className,
  inverted = false,
  brand,
}: {
  href?: string;
  className?: string;
  inverted?: boolean;
  brand?: ResolvedBrand | null;
}) {
  const displayName = brand?.displayName ?? PLATFORM_DEFAULTS.appName;
  const logoUrl = brand?.logoUrl ?? null;
  const accentStart = Math.max(
    displayName.length - 6,
    Math.min(4, displayName.length),
  );

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5 font-semibold tracking-tight",
        inverted ? "text-sidebar-foreground" : "text-foreground",
        className,
      )}
      aria-label={displayName}
    >
      {logoUrl ? (
        <span className="relative inline-flex size-9 shrink-0 overflow-hidden rounded-lg bg-white/95">
          {/* Remote Supabase Storage URLs — use img for flexible host config */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            className="size-full object-contain p-0.5"
          />
        </span>
      ) : (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Package className="size-5" aria-hidden />
        </span>
      )}
      <span className="truncate text-base">
        {displayName.length > 22 ? (
          displayName
        ) : (
          <>
            {displayName.slice(0, accentStart)}
            <span className="text-primary">{displayName.slice(accentStart)}</span>
          </>
        )}
      </span>
    </Link>
  );
}
