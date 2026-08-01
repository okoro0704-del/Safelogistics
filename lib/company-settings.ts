/**
 * Company operational settings (timezone, currency, support).
 * Visual branding stays in company_branding / lib/branding.ts.
 */

export const DEFAULT_TIMEZONE = "Africa/Lagos";
export const DEFAULT_CURRENCY = "NGN";

/** Curated IANA zones commonly used by tenants. */
export const COMPANY_TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Singapore",
  "UTC",
] as const;

export type CompanyTimezone = (typeof COMPANY_TIMEZONES)[number];

export const COMPANY_CURRENCIES = [
  "NGN",
  "USD",
  "GBP",
  "EUR",
  "GHS",
  "KES",
  "ZAR",
  "CAD",
] as const;

export type CompanyCurrency = (typeof COMPANY_CURRENCIES)[number];

export type CompanySettingsRow = {
  company_id: string;
  timezone: string;
  currency: string;
  support_email: string | null;
  support_phone: string | null;
  website_url: string | null;
  created_at?: string;
  updated_at?: string;
};

export function isValidTimezone(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if ((COMPANY_TIMEZONES as readonly string[]).includes(trimmed)) return true;
  // Allow other valid-looking IANA identifiers already stored in DB
  return /^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+)*$/.test(trimmed);
}

export function isValidCurrency(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

export function isAllowedCurrency(value: string | null | undefined): boolean {
  if (!value) return false;
  return (COMPANY_CURRENCIES as readonly string[]).includes(
    value.trim().toUpperCase(),
  );
}

export function isValidSupportPhone(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 7 || trimmed.length > 20) return false;
  return /^\+?[0-9()\-\s.]+$/.test(trimmed);
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}
