/**
 * Platform default branding + tenant branding resolution.
 * One codebase — company overrides via company_branding (or safe public payload).
 */

export const PLATFORM_DEFAULTS = {
  appName: "Parcel Movement",
  shortName: "Parcel Movement",
  tagline: "Track deliveries and keep customers informed.",
  description:
    "Branded delivery tracking for your company. Sign in to manage shipments and customers.",
  primaryColor: "#0f766e",
  secondaryColor: "#e2e8f0",
  accentColor: "#115e59",
  primaryForeground: "#f0fdfa",
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  supportEmail: null as string | null,
  websiteUrl: null as string | null,
} as const;

/** @deprecated use PLATFORM_DEFAULTS / resolveBrand */
export const brand = {
  appName: PLATFORM_DEFAULTS.appName,
  shortName: PLATFORM_DEFAULTS.shortName,
  tagline: PLATFORM_DEFAULTS.tagline,
  description: PLATFORM_DEFAULTS.description,
  logoMark: "package" as const,
};

export type CompanyBrandingRow = {
  company_id: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  tagline: string | null;
  support_email: string | null;
  website_url: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PublicCompanyBranding = {
  company_name: string;
  company_slug: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  tagline?: string | null;
  support_email?: string | null;
  website_url?: string | null;
};

export type ResolvedBrand = {
  displayName: string;
  appName: string;
  shortName: string;
  tagline: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  primaryForeground: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  supportEmail: string | null;
  websiteUrl: string | null;
  isCustom: boolean;
  companySlug?: string | null;
};

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string | null | undefined): boolean {
  if (!value) return false;
  return HEX_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb.r) +
    0.7152 * channel(rgb.g) +
    0.0722 * channel(rgb.b)
  );
}

/** Choose readable foreground for a solid primary button background. */
export function foregroundForBackground(hex: string): string {
  const L = relativeLuminance(hex);
  return L > 0.45 ? "#0f172a" : "#f8fafc";
}

export function contrastRatio(hexA: string, hexB: string): number {
  const L1 = relativeLuminance(hexA);
  const L2 = relativeLuminance(hexB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hasReadablePrimaryContrast(primaryHex: string): boolean {
  const fg = foregroundForBackground(primaryHex);
  return contrastRatio(primaryHex, fg) >= 3;
}

export function isValidWebsiteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidSupportEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type ResolveInput = {
  companyName?: string | null;
  companySlug?: string | null;
  branding?: Partial<CompanyBrandingRow> | PublicCompanyBranding | null;
  /** Legacy company columns */
  logo_url?: string | null;
  primary_color?: string | null;
};

export function resolveBrand(input?: ResolveInput | null): ResolvedBrand {
  const row = input?.branding ?? null;
  const publicBrand = row as PublicCompanyBranding | null;

  const customPrimary =
    (row && "primary_color" in row ? row.primary_color : null) ??
    input?.primary_color ??
    null;
  const customSecondary =
    row && "secondary_color" in row ? row.secondary_color : null;
  const customAccent = row && "accent_color" in row ? row.accent_color : null;
  const customLogo =
    (row && "logo_url" in row ? row.logo_url : null) ?? input?.logo_url ?? null;
  const customFavicon =
    row && "favicon_url" in row ? row.favicon_url : null;
  const customTagline = row && "tagline" in row ? row.tagline : null;
  const customSupport =
    row && "support_email" in row ? row.support_email : null;
  const customWebsite = row && "website_url" in row ? row.website_url : null;

  const displayName =
    publicBrand?.company_name ||
    input?.companyName ||
    PLATFORM_DEFAULTS.appName;

  const primary = isValidHexColor(customPrimary)
    ? normalizeHexColor(customPrimary!)!
    : PLATFORM_DEFAULTS.primaryColor;
  const secondary = isValidHexColor(customSecondary)
    ? normalizeHexColor(customSecondary!)!
    : PLATFORM_DEFAULTS.secondaryColor;
  const accent = isValidHexColor(customAccent)
    ? normalizeHexColor(customAccent!)!
    : PLATFORM_DEFAULTS.accentColor;

  const isCustom = Boolean(
    customPrimary ||
      customSecondary ||
      customAccent ||
      customLogo ||
      customFavicon ||
      customTagline ||
      customSupport ||
      customWebsite,
  );

  return {
    displayName,
    appName: displayName,
    shortName: displayName,
    tagline: customTagline?.trim() || PLATFORM_DEFAULTS.tagline,
    description: PLATFORM_DEFAULTS.description,
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: accent,
    primaryForeground: foregroundForBackground(primary),
    logoUrl: customLogo || null,
    faviconUrl: customFavicon || null,
    supportEmail: customSupport || null,
    websiteUrl: customWebsite || null,
    isCustom,
    companySlug: publicBrand?.company_slug || input?.companySlug || null,
  };
}

/** CSS custom properties for BrandTheme */
export function brandCssVars(resolved: ResolvedBrand): Record<string, string> {
  return {
    "--brand-primary": resolved.primaryColor,
    "--brand-secondary": resolved.secondaryColor,
    "--brand-accent": resolved.accentColor,
    "--primary": resolved.primaryColor,
    "--primary-foreground": resolved.primaryForeground,
    "--ring": resolved.primaryColor,
    "--accent-foreground": resolved.accentColor,
  };
}

export type BrandConfig = ResolvedBrand;
