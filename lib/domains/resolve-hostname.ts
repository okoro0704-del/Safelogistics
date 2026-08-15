import {
  isPlatformHostname,
  normalizeHostname,
  type ResolvedTenant,
} from "@/lib/domains/normalize";
import { previewDomainForSlug } from "@/lib/domains/preview";
import { isValidCompanySlug, normalizeCompanySlug } from "@/lib/utils";

/** Short-lived in-process hostname/slug → tenant cache. */
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
  if (key) resolveCache.delete(`host:${key}`);
}

export function invalidateSlugCache(slug?: string | null) {
  if (!slug) {
    resolveCache.clear();
    return;
  }
  resolveCache.delete(`slug:${normalizeCompanySlug(slug)}`);
}

type RpcClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }>;
};

function cacheGet(key: string): ResolvedTenant | null | undefined {
  const cached = resolveCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.tenant;
  }
  return undefined;
}

function cacheSet(key: string, tenant: ResolvedTenant | null) {
  resolveCache.set(key, {
    expires: Date.now() + CACHE_TTL_MS,
    tenant,
  });
}

export async function resolveCompanyFromHostname(
  hostname: string | null | undefined,
  rpcClient: RpcClient,
): Promise<ResolvedTenant | null> {
  const host = normalizeHostname(hostname);
  if (!host || isPlatformHostname(host)) {
    return null;
  }

  const cacheKey = `host:${host}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const { data, error } = await rpcClient.rpc("resolve_tenant_by_hostname", {
    p_hostname: host,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("resolveCompanyFromHostname", error);
    }
    cacheSet(cacheKey, null);
    return null;
  }

  const tenant = (data as ResolvedTenant | null) ?? null;
  cacheSet(cacheKey, tenant);
  return tenant;
}

/** Path preview: /t/{slug} on the platform host. */
export async function resolveCompanyFromSlug(
  slug: string | null | undefined,
  rpcClient: RpcClient,
): Promise<ResolvedTenant | null> {
  const normalized = normalizeCompanySlug(slug ?? "");
  if (!normalized || !isValidCompanySlug(normalized)) {
    return null;
  }

  const cacheKey = `slug:${normalized}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const { data, error } = await rpcClient.rpc("resolve_tenant_by_slug", {
    p_slug: normalized,
  });

  if (error) {
    // Do not cache RPC failures (missing migration looks like "not found" for 30s).
    const err = error as { message?: string; code?: string };
    console.warn("resolveCompanyFromSlug", err?.code ?? "", err?.message ?? error);
    return null;
  }

  let tenant = (data as ResolvedTenant | null) ?? null;
  if (tenant && !tenant.domain) {
    tenant = { ...tenant, domain: previewDomainForSlug(normalized) };
  }
  cacheSet(cacheKey, tenant);
  return tenant;
}
