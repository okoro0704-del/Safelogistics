import type { DeliveryStatus, StopStatus } from "@/lib/types/database";

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "pending",
  "in_transit",
  "at_stop",
  "delivered",
  "cancelled",
  "delayed",
];

export function formatDeliveryStatus(status: DeliveryStatus | string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatStopStatus(status: StopStatus | string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** e.g. "Aug 1, 2026 at 5:42 PM" */
export function formatDateTimeLong(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  const day = formatDate(value);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} at ${time}`;
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Relative label plus exact time available separately via formatDateTime. */
export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return "—";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

export function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function friendlyErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) && typeof error !== "string") {
    return fallback;
  }

  const message = typeof error === "string" ? error : error.message;
  if (!message) return fallback;
  const lower = message.toLowerCase();

  if (lower.includes("duplicate") || lower.includes("already registered")) {
    return "An account with this email already exists.";
  }
  if (lower.includes("slug already")) {
    return "This app URL identifier is already in use.";
  }
  if (lower.includes("admin profile already")) {
    return "That administrator account is already linked to a profile.";
  }
  if (
    lower.includes("could not choose") ||
    lower.includes("best candidate function") ||
    lower.includes("function public.master_provision_company") ||
    lower.includes("could not find the function") ||
    lower.includes("pgrst202") ||
    lower.includes("pgrst203")
  ) {
    return "Database provisioning function is misconfigured. Run scripts/fix-provision-overloads.sql in the Supabase SQL Editor, then try again.";
  }
  if (lower.includes("only the platform master admin")) {
    return "Your session is not recognized as Master Admin. Sign out and sign in again at /master-admin/login.";
  }
  if (lower.includes("payment amount and method")) {
    return "Unable to create the app. Please try again or contact support.";
  }
  if (lower.includes("invalid currency") || lower.includes("3-letter")) {
    return "Invalid currency code.";
  }
  if (lower.includes("website_url") || lower.includes("https?://")) {
    return "Website URL must start with http:// or https://";
  }
  if (
    lower.includes("permission") ||
    lower.includes("not authorized") ||
    lower.includes("42501")
  ) {
    return "You do not have permission to perform this action.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error. Please check your connection and try again.";
  }
  if (
    lower.includes("service_role") ||
    lower.includes("api token") ||
    lower.includes("not configured")
  ) {
    return fallback;
  }

  // Prefer known RAISE EXCEPTION messages from our RPCs
  if (
    lower.includes("company name is required") ||
    lower.includes("admin name is required") ||
    lower.includes("admin email is required") ||
    lower.includes("company slug must") ||
    lower.includes("bucket") ||
    lower.includes("storage")
  ) {
    return message;
  }

  // Avoid leaking raw Postgres / provider internals
  if (
    /^\d{5}/.test(message) ||
    lower.includes("violates") ||
    lower.includes("constraint") ||
    lower.includes("supabase") ||
    lower.includes("postgres")
  ) {
    return fallback || message;
  }

  if (message.length > 280) {
    return fallback || message.slice(0, 280);
  }

  return message || fallback;
}
