import { isValidCompanySlug, normalizeCompanySlug } from "@/lib/utils";

/** Cookie keeps tenant preview context after client navigations drop /t/{slug}. */
export const TENANT_PREVIEW_COOKIE = "sl_tenant_preview";

const PREVIEW_PATH_RE = /^\/t\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\/|$)/;

export type TenantPreviewPath = {
  slug: string;
  /** Path after /t/{slug}, always starting with / (or "/" alone). */
  restPath: string;
};

/** Parse `/t/{slug}` or `/t/{slug}/...` from a pathname. */
export function parseTenantPreviewPath(
  pathname: string,
): TenantPreviewPath | null {
  const match = PREVIEW_PATH_RE.exec(pathname);
  if (!match?.[1]) return null;
  const slug = normalizeCompanySlug(match[1]);
  if (!isValidCompanySlug(slug)) return null;
  const rest = pathname.slice(match[0].length);
  const restPath = !rest || rest === "" ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
  return { slug, restPath };
}

export function tenantPreviewPath(slug: string, restPath = "/"): string {
  const normalized = normalizeCompanySlug(slug);
  const rest =
    !restPath || restPath === "/"
      ? ""
      : restPath.startsWith("/")
        ? restPath
        : `/${restPath}`;
  return `/t/${normalized}${rest}`;
}

/** Hub / platform routes must not inherit tenant preview context. */
export function isPlatformExclusivePath(pathname: string): boolean {
  return (
    pathname === "/hub" ||
    pathname.startsWith("/hub/") ||
    pathname === "/master-admin" ||
    pathname.startsWith("/master-admin/") ||
    pathname.startsWith("/api/master-admin") ||
    pathname.startsWith("/coming-soon")
  );
}

export function previewDomainForSlug(slug: string): string {
  return `t/${normalizeCompanySlug(slug)}`;
}
