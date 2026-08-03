import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string) {
  const parts = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "MA";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function homePathForRole(role: string | null | undefined) {
  switch (role) {
    case "admin":
      return "/admin";
    case "customer":
      return "/dashboard";
    case "master_admin":
      return "/master-admin";
    default:
      return "/login";
  }
}

export const COMPANY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCompanySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidCompanySlug(value: string) {
  return COMPANY_SLUG_PATTERN.test(value);
}

export const TRACKING_NUMBER_PATTERN =
  /^(DLV-\d{4}-\d{6}|DLV-[0-9A-F]{12})$/i;

export function normalizeTrackingNumber(value: string) {
  return value.trim().toUpperCase();
}

export function isValidTrackingNumber(value: string) {
  return TRACKING_NUMBER_PATTERN.test(normalizeTrackingNumber(value));
}
