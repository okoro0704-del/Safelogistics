import { getSharedMockRegistrarProvider } from "@/lib/domains/providers/registrar/mock";
import { createNamecheapRegistrarFromEnv } from "@/lib/domains/providers/registrar/namecheap";
import {
  RegistrarProviderError,
  type RegistrarProvider,
} from "@/lib/domains/providers/registrar/types";

export type RegistrarProviderId = "mock" | "namecheap" | "none";

export function getConfiguredRegistrarProviderId(): RegistrarProviderId {
  const raw = (process.env.REGISTRAR_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) {
    if (process.env.NAMECHEAP_API_KEY?.trim()) return "namecheap";
    return process.env.NODE_ENV === "production" ? "none" : "mock";
  }
  if (raw === "mock" || raw === "namecheap" || raw === "none") return raw;
  return "none";
}

export function createRegistrarProvider(): RegistrarProvider | null {
  const id = getConfiguredRegistrarProviderId();
  if (id === "none") return null;

  if (id === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new RegistrarProviderError(
        "Mock registrar cannot run in production",
        "unsupported",
      );
    }
    return getSharedMockRegistrarProvider();
  }

  if (id === "namecheap") {
    return createNamecheapRegistrarFromEnv();
  }

  return null;
}

export {
  getNamecheapContactFromEnv,
  createNamecheapRegistrarFromEnv,
} from "@/lib/domains/providers/registrar/namecheap";
export type {
  DomainAvailability,
  DnsHostRecord,
  RegistrarContact,
  RegistrarProvider,
  RegisterDomainResult,
} from "@/lib/domains/providers/registrar/types";
export { RegistrarProviderError } from "@/lib/domains/providers/registrar/types";
