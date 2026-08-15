import { type NextRequest, NextResponse } from "next/server";

import {
  TENANT_COMPANY_ID_HEADER,
  TENANT_COMPANY_NAME_HEADER,
  TENANT_COMPANY_SLUG_HEADER,
  TENANT_DOMAIN_HEADER,
} from "@/lib/domains/headers";
import {
  isPlatformHostname,
  parseTenantSubdomainHostname,
} from "@/lib/domains/normalize";
import {
  isPlatformExclusivePath,
  parseTenantPreviewPath,
  TENANT_PREVIEW_COOKIE,
} from "@/lib/domains/preview";
import {
  resolveCompanyFromHostname,
  resolveCompanyFromSlug,
} from "@/lib/domains/resolve-hostname";
import { updateSession } from "@/lib/supabase/middleware";
import { homePathForRole } from "@/lib/utils";
import type { CompanyStatus, Profile } from "@/lib/types/database";
import type { ResolvedTenant } from "@/lib/domains/normalize";

const PUBLIC_AUTH_ROUTES = [
  "/login",
  "/master-admin/login",
  "/master-admin/setup",
  "/forgot-password",
  "/update-password",
];

type TenantHeaderPayload = {
  company_id: string;
  company_name: string;
  company_slug: string;
  domain: string;
};

function toHeaderPayload(tenant: ResolvedTenant): TenantHeaderPayload {
  return {
    company_id: tenant.company_id,
    company_name: tenant.company_name,
    company_slug: tenant.company_slug,
    domain: tenant.domain,
  };
}

function isMasterAdminLoginPath(pathname: string) {
  return (
    pathname === "/master-admin/login" ||
    pathname.startsWith("/master-admin/login/")
  );
}

function isMasterAdminSetupPath(pathname: string) {
  return (
    pathname === "/master-admin/setup" ||
    pathname.startsWith("/master-admin/setup/")
  );
}

function withTenantHeaders(
  response: NextResponse,
  tenant: TenantHeaderPayload | null,
) {
  if (tenant) {
    response.headers.set(TENANT_COMPANY_ID_HEADER, tenant.company_id);
    response.headers.set(TENANT_COMPANY_NAME_HEADER, tenant.company_name);
    response.headers.set(TENANT_COMPANY_SLUG_HEADER, tenant.company_slug);
    response.headers.set(TENANT_DOMAIN_HEADER, tenant.domain);
    response.headers.set("x-middleware-tenant", "1");
  }
  return response;
}

function applyRequestTenantHeaders(
  request: NextRequest,
  tenant: TenantHeaderPayload | null,
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(TENANT_COMPANY_ID_HEADER);
  requestHeaders.delete(TENANT_COMPANY_NAME_HEADER);
  requestHeaders.delete(TENANT_COMPANY_SLUG_HEADER);
  requestHeaders.delete(TENANT_DOMAIN_HEADER);
  if (tenant) {
    requestHeaders.set(TENANT_COMPANY_ID_HEADER, tenant.company_id);
    requestHeaders.set(TENANT_COMPANY_NAME_HEADER, tenant.company_name);
    requestHeaders.set(TENANT_COMPANY_SLUG_HEADER, tenant.company_slug);
    requestHeaders.set(TENANT_DOMAIN_HEADER, tenant.domain);
  }
  return requestHeaders;
}

function setPreviewCookie(response: NextResponse, slug: string) {
  response.cookies.set(TENANT_PREVIEW_COOKIE, slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
}

function clearPreviewCookie(response: NextResponse) {
  response.cookies.set(TENANT_PREVIEW_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    const hostname = request.nextUrl.hostname;
    const { supabase, user, supabaseResponse } = await updateSession(request);

    let tenant = await resolveCompanyFromHostname(hostname, supabase);
    let effectivePath = pathname;
    let previewSlug: string | null = null;
    let shouldRewritePreview = false;
    let clearPreview = false;

    // Automatic tenant hosts: {slug}.apps.webfinance.app
    if (!tenant) {
      const subdomainSlug = parseTenantSubdomainHostname(hostname);
      if (subdomainSlug) {
        const subdomainTenant = await resolveCompanyFromSlug(
          subdomainSlug,
          supabase,
        );
        if (!subdomainTenant) {
          return new NextResponse("App not found.", { status: 404 });
        }
        tenant = subdomainTenant;
      }
    }

    // Path preview only on platform hosts (not custom / managed subdomains).
    if (!tenant && isPlatformHostname(hostname)) {
      const parsed = parseTenantPreviewPath(pathname);
      if (parsed) {
        const previewTenant = await resolveCompanyFromSlug(
          parsed.slug,
          supabase,
        );
        if (!previewTenant) {
          return new NextResponse(
            "App not found. Confirm the company slug is active in Master Admin. If it exists, run scripts/resolve-tenant-by-slug.sql in the Supabase SQL Editor (path preview RPC).",
            { status: 404 },
          );
        }
        tenant = previewTenant;
        previewSlug = parsed.slug;
        effectivePath = parsed.restPath;
        shouldRewritePreview = true;
      } else if (isPlatformExclusivePath(pathname)) {
        clearPreview = true;
      } else {
        const cookieSlug = request.cookies.get(TENANT_PREVIEW_COOKIE)?.value;
        if (cookieSlug) {
          const previewTenant = await resolveCompanyFromSlug(
            cookieSlug,
            supabase,
          );
          if (previewTenant) {
            tenant = previewTenant;
            previewSlug = previewTenant.company_slug;
          } else {
            clearPreview = true;
          }
        }
      }
    }

    const tenantHeaders = tenant ? toHeaderPayload(tenant) : null;
    const requestHeaders = applyRequestTenantHeaders(request, tenantHeaders);

    let response: NextResponse;
    if (shouldRewritePreview) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = effectivePath;
      response = NextResponse.rewrite(rewriteUrl, {
        request: { headers: requestHeaders },
      });
    } else {
      response = NextResponse.next({
        request: { headers: requestHeaders },
      });
    }

    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value);
    });
    response = withTenantHeaders(response, tenantHeaders);

    if (previewSlug) {
      setPreviewCookie(response, previewSlug);
    } else if (clearPreview) {
      clearPreviewCookie(response);
    }

    if (tenant) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Host, Cookie");
    }

    // Platform root without tenant → Application Hub.
    if (!tenant && (effectivePath === "/" || effectivePath === "")) {
      const hubUrl = request.nextUrl.clone();
      hubUrl.pathname = user ? "/master-admin" : "/master-admin/login";
      hubUrl.search = "";
      const redirect = NextResponse.redirect(hubUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirect.cookies.set(cookie.name, cookie.value);
      });
      clearPreviewCookie(redirect);
      return redirect;
    }

    const isAdminRoute = effectivePath.startsWith("/admin");
    const isCustomerRoute = effectivePath.startsWith("/dashboard");
    const isMasterLoginRoute = isMasterAdminLoginPath(effectivePath);
    const isMasterSetupRoute = isMasterAdminSetupPath(effectivePath);
    const isMasterRoute =
      effectivePath.startsWith("/master-admin") &&
      !isMasterLoginRoute &&
      !isMasterSetupRoute;
    const isComingSoon = effectivePath.startsWith("/coming-soon");
    const isSuspended = effectivePath.startsWith("/suspended");
    const isAuthRoute = PUBLIC_AUTH_ROUTES.some(
      (route) =>
        effectivePath === route || effectivePath.startsWith(`${route}/`),
    );
    const isProtected =
      isAdminRoute || isCustomerRoute || isMasterRoute || isComingSoon;

    // Tenant context never exposes Master Admin UI or APIs
    if (
      tenant &&
      (isMasterRoute ||
        isMasterLoginRoute ||
        isMasterSetupRoute ||
        effectivePath.startsWith("/api/master-admin"))
    ) {
      if (effectivePath.startsWith("/api/master-admin")) {
        return NextResponse.json(
          { error: "Not available on this domain." },
          { status: 403 },
        );
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/unauthorized";
      redirectUrl.search = "";
      const redirect = withTenantHeaders(
        NextResponse.redirect(redirectUrl),
        tenantHeaders,
      );
      if (previewSlug) setPreviewCookie(redirect, previewSlug);
      return redirect;
    }

    if (isProtected && !user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = isMasterRoute ? "/master-admin/login" : "/login";
      if (!isMasterRoute) {
        loginUrl.searchParams.set("next", effectivePath);
      }
      const redirect = withTenantHeaders(
        NextResponse.redirect(loginUrl),
        tenantHeaders,
      );
      if (previewSlug) setPreviewCookie(redirect, previewSlug);
      return redirect;
    }

    if (!user) {
      return response;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .maybeSingle();

    const typed = profile as Pick<Profile, "role" | "company_id"> | null;
    const role = typed?.role ?? null;

    if (!role) {
      if (isProtected) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        return NextResponse.redirect(loginUrl);
      }
      return response;
    }

    if (
      tenant &&
      (role === "admin" || role === "customer") &&
      typed?.company_id &&
      typed.company_id !== tenant.company_id &&
      (isAdminRoute || isCustomerRoute || isAuthRoute)
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/unauthorized";
      redirectUrl.search = "";
      const redirect = withTenantHeaders(
        NextResponse.redirect(redirectUrl),
        tenantHeaders,
      );
      if (previewSlug) setPreviewCookie(redirect, previewSlug);
      return redirect;
    }

    if (
      typed?.company_id &&
      (role === "admin" || role === "customer") &&
      (isAdminRoute || isCustomerRoute)
    ) {
      const { data: company } = await supabase
        .from("companies")
        .select("status")
        .eq("id", typed.company_id)
        .maybeSingle();
      const status = (company as { status: CompanyStatus } | null)?.status;
      if (status === "suspended") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/suspended";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
    }

    if (isSuspended && role === "master_admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/master-admin";
      return NextResponse.redirect(redirectUrl);
    }

    const home = homePathForRole(role);

    if (isAuthRoute && effectivePath !== "/update-password") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = home;
      redirectUrl.search = "";
      const redirect = NextResponse.redirect(redirectUrl);
      if (previewSlug) setPreviewCookie(redirect, previewSlug);
      return redirect;
    }

    if (isAdminRoute && role !== "admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = role === "master_admin" ? "/unauthorized" : home;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (isCustomerRoute && role !== "customer") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = home;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (isMasterRoute && role !== "master_admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/unauthorized";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (isComingSoon && role !== "master_admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = home;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (isComingSoon && role === "master_admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/master-admin";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  } catch {
    const scrubbed = NextResponse.next({
      request: {
        headers: applyRequestTenantHeaders(request, null),
      },
    });

    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/t/") ||
      (pathname.startsWith("/master-admin") &&
        !isMasterAdminLoginPath(pathname) &&
        !isMasterAdminSetupPath(pathname)) ||
      pathname.startsWith("/api/master-admin") ||
      pathname.startsWith("/coming-soon")
    ) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = pathname.startsWith("/master-admin")
        ? "/master-admin/login"
        : "/login";
      return NextResponse.redirect(loginUrl);
    }
    return scrubbed;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
