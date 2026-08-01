import {
  isPlatformHostname,
  normalizeHostname,
  type ResolvedTenant,
} from "@/lib/domains/normalize";

/** Short-lived in-process hostname → tenant cache. */
const resolveCache = new Map<
  string,
  { expires: number; tenant: ResolvedTenant | null }
>();
const CACHE_TTL_MS = 30_000;

export function invalidateDomainCache(hostname?: string | null) {
  if (!hostname) {
    resolveCache.clear();
    return;
  }
  const key = normalizeHostname(hostname);
  if (key) resolveCache.delete(key);
}

type RpcClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function resolveCompanyFromHostname(
  hostname: string | null | undefined,
  rpcClient: RpcClient,
): Promise<ResolvedTenant | null> {
  const host = normalizeHostname(hostname);
  if (!host || isPlatformHostname(host)) {
    return null;
  }

  const cached = resolveCache.get(host);
  if (cached && cached.expires > Date.now()) {
    return cached.tenant;
  }

  const { data, error } = await rpcClient.rpc("resolve_tenant_by_hostname", {
    p_hostname: host,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("resolveCompanyFromHostname", error);
    }
    resolveCache.set(host, { expires: Date.now() + CACHE_TTL_MS, tenant: null });
    return null;
  }

  const tenant = (data as ResolvedTenant | null) ?? null;
  resolveCache.set(host, {
    expires: Date.now() + CACHE_TTL_MS,
    tenant,
  });
  return tenant;
}
