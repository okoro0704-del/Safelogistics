import { HostingProviderError, type HostingProvider } from "@/lib/domains/providers/hosting/types";
import { getSharedMockHostingProvider } from "@/lib/domains/providers/hosting/mock";
import { createNetlifyHostingProviderFromEnv } from "@/lib/domains/providers/hosting/netlify";
import { createVercelHostingProviderFromEnv } from "@/lib/domains/providers/hosting/vercel";

export type HostingProviderId = "mock" | "vercel" | "netlify" | "none";

export function getConfiguredHostingProviderId(): HostingProviderId {
  const raw = (process.env.HOSTING_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === "production" ? "none" : "mock";
  }
  if (raw === "mock" || raw === "vercel" || raw === "netlify" || raw === "none") {
    return raw;
  }
  return "none";
}

export function createHostingProvider(): HostingProvider | null {
  const id = getConfiguredHostingProviderId();
  if (id === "none") return null;

  if (id === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new HostingProviderError(
        "Mock hosting provider cannot run in production",
        "unsupported",
      );
    }
    return getSharedMockHostingProvider();
  }

  if (id === "vercel") {
    return createVercelHostingProviderFromEnv();
  }

  if (id === "netlify") {
    return createNetlifyHostingProviderFromEnv();
  }

  return null;
}
