"use client";

import type { CSSProperties, ReactNode } from "react";

import { brandCssVars, type ResolvedBrand } from "@/lib/branding";

export function BrandTheme({
  brand,
  children,
  className,
}: {
  brand: ResolvedBrand;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={brandCssVars(brand) as CSSProperties}
      data-brand={brand.companySlug ?? "platform"}
    >
      {children}
    </div>
  );
}
