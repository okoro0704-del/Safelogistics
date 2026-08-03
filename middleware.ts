import { type NextRequest, NextResponse } from "next/server";

import {
  TENANT_COMPANY_ID_HEADER,
  TENANT_COMPANY_NAME_HEADER,
  TENANT_COMPANY_SLUG_HEADER,
  TENANT_DOMAIN_HEADER,
} from "@/lib/domains/headers";
import { resolveCompanyFromHostname } from "@/lib/domains/resolve-hostname";
import { updateSession } from "@/lib/supabase/middleware";
import { homePathForRole } from "@/lib/utils";
import type { CompanyStatus, Profile } from "@/lib/types/database";

const PUBLIC_AUTH_ROUTES = [
  "/login",
  "/master-admin/login",
  "/master-admin/setup",
  "/forgot-password",
  "/update-password",
];

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
  tenant: {
    company_id: string;
    company_name: string;
    company_slug: string;
    domain: string;
  } | null,
) {
  if (tenant) {
    response.headers.set(TENANT_COMPANY_ID_HEADER, tenant.company_id);
    response.headers.set(TENANT_COMPANY_NAME_HEADER, tenant.company_name);
    response.headers.set(TENANT_COMPANY_SLUG_HEADER, tenant.company_slug);
    response.headers.set(TENANT_DOMAIN_HEADER, tenant.domain);
    // Expose to server components via request headers clone pattern
    response.headers.set("x-middleware-tenant", "1");
  }
  return response;
}

function applyRequestTenantHeaders(
  request: NextRequest,
  tenant: {
    company_id: string;
    company_name: string;
    company_slug: string;
    domain: string;
  } | null,
) {
  const requestHeaders = new Headers(request.headers);
  // Clear any client-spoofed tenant headers
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    // Prefer Next.js URL hostname (hosting-aware) over client-spoofable headers
    const hostname = request.nextUrl.hostname;
    const { supabase, user, supabaseResponse } = await updateSession(request);

    const tenant = await resolveCompanyFromHostname(hostname, supabase);

    const requestHeaders = applyRequestTenantHeaders(
      request,
      tenant
        ? {
            company_id: tenant.company_id,
            company_name: tenant.company_name,
            company_slug: tenant.company_slug,
            domain: tenant.domain,
          }
        : null,
    );

    // Rebuild response so downstream RSC can read tenant headers
    let response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    // Preserve auth cookies from updateSession
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value);
    });
    response = withTenantHeaders(
      response,
      tenant
        ? {
            company_id: tenant.company_id,
            company_name: tenant.company_name,
            company_slug: tenant.company_slug,
            domain: tenant.domain,
          }
        : null,
    );
    // Prevent CDN/shared caches from mixing tenant HTML
    if (tenant) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Host");
    }

    // Platform root (safeogistics.netlify.app) → Application Hub, not a tenant landing.
    // Tenant marketing/tracking lives on custom domains (e.g. RouteLedger).
    if (!tenant && (pathname === "/" || pathname === "")) {
      const hubUrl = request.nextUrl.clone();
      hubUrl.pathname = user ? "/hub" : "/hub/login";
      hubUrl.search = "";
      const redirect = NextResponse.redirect(hubUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirect.cookies.set(cookie.name, cookie.value);
      });
      return redirect;
    }

    const isAdminRoute = pathname.startsWith("/admin");
    const isCustomerRoute = pathname.startsWith("/dashboard");
    const isMasterLoginRoute = isMasterAdminLoginPath(pathname);
    const isMasterSetupRoute = isMasterAdminSetupPath(pathname);
    const isMasterRoute =
      pathname.startsWith("/master-admin") &&
      !isMasterLoginRoute &&
      !isMasterSetupRoute;
    const isComingSoon = pathname.startsWith("/coming-soon");
    const isSuspended = pathname.startsWith("/suspended");
    const isAuthRoute = PUBLIC_AUTH_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
    const isProtected =
      isAdminRoute || isCustomerRoute || isMasterRoute || isComingSoon;

    // Custom domains never expose Master Admin UI or APIs (including platform login/setup)
    if (
      tenant &&
      (isMasterRoute ||
        isMasterLoginRoute ||
        isMasterSetupRoute ||
        pathname.startsWith("/api/master-admin"))
    ) {
      if (pathname.startsWith("/api/master-admin")) {
        return NextResponse.json(
          { error: "Not available on this domain." },
          { status: 403 },
        );
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/unauthorized";
      redirectUrl.search = "";
      return withTenantHeaders(NextResponse.redirect(redirectUrl), {
        company_id: tenant.company_id,
        company_name: tenant.company_name,
        company_slug: tenant.company_slug,
        domain: tenant.domain,
      });
    }

    if (isProtected && !user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = isMasterRoute ? "/hub/login" : "/login";
      if (!isMasterRoute) {
        loginUrl.searchParams.set("next", pathname);
      }
      return withTenantHeaders(
        NextResponse.redirect(loginUrl),
        tenant
          ? {
              company_id: tenant.company_id,
              company_name: tenant.company_name,
              company_slug: tenant.company_slug,
              domain: tenant.domain,
            }
          : null,
      );
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

    // Hostname is a routing hint — authenticated users must match tenant company
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
      return withTenantHeaders(NextResponse.redirect(redirectUrl), {
        company_id: tenant.company_id,
        company_name: tenant.company_name,
        company_slug: tenant.company_slug,
        domain: tenant.domain,
      });
    }

    // Master Admin on a custom domain: allow public pages only; private tenant
    // portals stay blocked by role checks. Coming-soon / master routes already blocked.

    // Suspended company users cannot use admin/customer portals
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

    if (isAuthRoute && pathname !== "/update-password") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = home;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
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
    // Never fail open with client-spoofable tenant headers
    const scrubbed = NextResponse.next({
      request: {
        headers: applyRequestTenantHeaders(request, null),
      },
    });

    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/dashboard") ||
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
        ? "/hub/login"
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
