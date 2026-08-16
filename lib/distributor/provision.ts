import {
  generateVerificationToken,
  isValidHostname,
  normalizeHostname,
} from "@/lib/domains/normalize";
import { buildTenantDeliverableUrls } from "@/lib/domains/tenant-urls";
import { isUuid, sha256Hex } from "@/lib/distributor/hmac";
import { generateTemporaryPassword } from "@/lib/master-admin/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isValidCompanySlug, normalizeCompanySlug } from "@/lib/utils";

export type DistributorProvisionBody = {
  client_id: string;
  distributor_id: string;
  product_sku: string;
  display_name: string;
  slug: string;
  custom_domain?: string | null;
  timestamp?: string | null;
  admin_email: string;
  admin_full_name: string;
  admin_phone?: string | null;
};

export type DistributorProvisionResponse = {
  tenant_id: string;
  admin_email: string;
  temporary_password: string | null;
  access_url: string;
  company_id?: string;
  company_slug?: string;
  custom_domain?: string | null;
  product_sku?: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseDistributorProvisionBody(
  raw: unknown,
): { ok: true; data: DistributorProvisionBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const body = raw as Record<string, unknown>;

  const client_id = String(body.client_id ?? "").trim();
  const distributor_id = String(body.distributor_id ?? "").trim();
  const product_sku = String(body.product_sku ?? "").trim();
  const display_name = String(body.display_name ?? "").trim();
  const slug = normalizeCompanySlug(String(body.slug ?? ""));
  const custom_domain_raw = String(body.custom_domain ?? "").trim() || null;
  const timestamp = String(body.timestamp ?? "").trim() || null;
  const admin_email = String(body.admin_email ?? "").trim().toLowerCase();
  const admin_full_name = String(body.admin_full_name ?? "").trim();
  const admin_phone = String(body.admin_phone ?? "").trim() || null;

  if (!isUuid(client_id)) {
    return { ok: false, error: "client_id must be a UUID." };
  }
  if (!isUuid(distributor_id)) {
    return { ok: false, error: "distributor_id must be a UUID." };
  }
  if (!product_sku || product_sku.length > 64) {
    return { ok: false, error: "product_sku is required (max 64 chars)." };
  }
  if (!display_name || display_name.length > 120) {
    return { ok: false, error: "display_name is required (max 120 chars)." };
  }
  if (!isValidCompanySlug(slug)) {
    return {
      ok: false,
      error: "slug must be lowercase letters, numbers, and hyphens.",
    };
  }
  if (!admin_email || !isValidEmail(admin_email)) {
    return { ok: false, error: "admin_email is required and must be valid." };
  }
  if (!admin_full_name || admin_full_name.length > 120) {
    return { ok: false, error: "admin_full_name is required (max 120 chars)." };
  }

  let custom_domain: string | null = null;
  if (custom_domain_raw) {
    const host = normalizeHostname(custom_domain_raw);
    if (!host || !isValidHostname(host)) {
      return { ok: false, error: "custom_domain is not a valid hostname." };
    }
    custom_domain = host;
  }

  return {
    ok: true,
    data: {
      client_id,
      distributor_id,
      product_sku,
      display_name,
      slug,
      custom_domain,
      timestamp,
      admin_email,
      admin_full_name,
      admin_phone,
    },
  };
}

export function buildAccessUrl(slug: string): string {
  const urls = buildTenantDeliverableUrls(slug);
  return urls.adminLoginUrl;
}

export function toTenantId(companyId: string): string {
  return `ten_${companyId}`;
}

export async function provisionDistributorTenant(input: {
  body: DistributorProvisionBody;
  rawBody: string;
  idempotencyKey: string;
}): Promise<
  | { ok: true; status: 200; response: DistributorProvisionResponse; replay: boolean }
  | { ok: false; status: number; error: string }
> {
  const requestHash = sha256Hex(input.rawBody);
  let adminClient: ReturnType<typeof createServiceRoleClient>;

  try {
    adminClient = createServiceRoleClient();
  } catch {
    return {
      ok: false,
      status: 500,
      error: "Provisioning is not configured. Set SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const { data: existingKey, error: existingKeyError } = await adminClient
    .from("distributor_provision_requests")
    .select("request_hash, response_json, company_id")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existingKeyError) {
    return {
      ok: false,
      status: 500,
      error:
        existingKeyError.message.includes("does not exist") ||
        existingKeyError.code === "42P01"
          ? "Distributor provision store is missing. Run migration 20260816100000_distributor_tenant_provision.sql."
          : existingKeyError.message,
    };
  }

  if (existingKey) {
    const row = existingKey as unknown as {
      request_hash: string;
      response_json: DistributorProvisionResponse;
    };
    if (row.request_hash !== requestHash) {
      return {
        ok: false,
        status: 409,
        error:
          "Idempotency key was already used with a different request body.",
      };
    }
    const replay = {
      ...row.response_json,
      temporary_password: null,
    };
    return { ok: true, status: 200, response: replay, replay: true };
  }

  const { data: slugTaken } = await adminClient
    .from("companies")
    .select("id, slug, name")
    .eq("slug", input.body.slug)
    .maybeSingle();

  if (slugTaken) {
    return {
      ok: false,
      status: 409,
      error: `Company slug "${input.body.slug}" already exists.`,
    };
  }

  if (input.body.custom_domain) {
    const { data: domainTaken } = await adminClient
      .from("company_domains")
      .select("id")
      .eq("normalized_domain", input.body.custom_domain)
      .maybeSingle();
    if (domainTaken) {
      return {
        ok: false,
        status: 409,
        error: `custom_domain "${input.body.custom_domain}" is already registered.`,
      };
    }
  }

  const password = generateTemporaryPassword();
  let createdUserId: string | null = null;
  let createdCompanyId: string | null = null;

  try {
    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email: input.body.admin_email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: input.body.admin_full_name,
          provisioned_by: "distributor",
          client_id: input.body.client_id,
          distributor_id: input.body.distributor_id,
          product_sku: input.body.product_sku,
        },
      });

    if (createError || !created.user) {
      const raw = (createError?.message ?? "").toLowerCase();
      if (
        raw.includes("already") ||
        raw.includes("registered") ||
        raw.includes("exists")
      ) {
        return {
          ok: false,
          status: 409,
          error: "This administrator email is already in use.",
        };
      }
      return {
        ok: false,
        status: 400,
        error: createError?.message ?? "Unable to create administrator.",
      };
    }

    createdUserId = created.user.id;

    const { data: result, error: provisionError } = await adminClient.rpc(
      "service_provision_company",
      {
        p_company_name: input.body.display_name,
        p_company_slug: input.body.slug,
        p_admin_user_id: created.user.id,
        p_admin_full_name: input.body.admin_full_name,
        p_admin_email: input.body.admin_email,
        p_admin_phone: input.body.admin_phone,
        p_company_email: input.body.admin_email,
        p_support_email: input.body.admin_email,
        p_tagline: `Provisioned via Webfinance (${input.body.product_sku})`,
      } as never,
    );

    if (provisionError || !result) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      createdUserId = null;
      return {
        ok: false,
        status: 400,
        error:
          provisionError?.message ??
          "Unable to provision tenant. Ensure service_provision_company migration is applied.",
      };
    }

    const provisioned =
      typeof result === "object" && result !== null
        ? (result as { company?: { id: string; slug?: string } })
        : null;
    const companyId = provisioned?.company?.id ?? null;
    if (!companyId) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      createdUserId = null;
      return {
        ok: false,
        status: 500,
        error: "Provision RPC returned no company.",
      };
    }
    createdCompanyId = companyId;

    if (input.body.custom_domain) {
      const token = generateVerificationToken();
      const { error: domainError } = await adminClient
        .from("company_domains")
        .insert({
          company_id: companyId,
          domain: input.body.custom_domain,
          normalized_domain: input.body.custom_domain,
          verification_token: token,
          status: "pending",
          is_primary: false,
        });
      if (domainError) {
        await adminClient.from("companies").delete().eq("id", companyId);
        await adminClient.auth.admin.deleteUser(created.user.id);
        createdUserId = null;
        createdCompanyId = null;
        return {
          ok: false,
          status: 400,
          error: domainError.message || "Unable to register custom_domain.",
        };
      }
    }

    const response: DistributorProvisionResponse = {
      tenant_id: toTenantId(companyId),
      admin_email: input.body.admin_email,
      temporary_password: password,
      access_url: buildAccessUrl(input.body.slug),
      company_id: companyId,
      company_slug: input.body.slug,
      custom_domain: input.body.custom_domain,
      product_sku: input.body.product_sku,
    };

    const { error: storeError } = await adminClient
      .from("distributor_provision_requests")
      .insert({
        idempotency_key: input.idempotencyKey,
        client_id: input.body.client_id,
        distributor_id: input.body.distributor_id,
        product_sku: input.body.product_sku,
        request_hash: requestHash,
        company_id: companyId,
        admin_email: input.body.admin_email,
        response_json: response,
      });

    if (storeError) {
      // Unique race: another identical request won — return their stored response.
      if (storeError.code === "23505") {
        const { data: raced } = await adminClient
          .from("distributor_provision_requests")
          .select("request_hash, response_json")
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (
          raced &&
          (raced as { request_hash: string }).request_hash === requestHash
        ) {
          // Best-effort cleanup of this duplicate tenant
          await adminClient.from("companies").delete().eq("id", companyId);
          if (createdUserId) {
            await adminClient.auth.admin.deleteUser(createdUserId);
          }
          const replay = {
            ...((raced as unknown as {
              response_json: DistributorProvisionResponse;
            }).response_json),
            temporary_password: null,
          };
          return { ok: true, status: 200, response: replay, replay: true };
        }
      }
      return {
        ok: false,
        status: 500,
        error: storeError.message || "Unable to persist idempotency record.",
      };
    }

    return { ok: true, status: 200, response, replay: false };
  } catch (error) {
    if (createdCompanyId) {
      try {
        await adminClient.from("companies").delete().eq("id", createdCompanyId);
      } catch {
        /* ignore */
      }
    }
    if (createdUserId) {
      try {
        await adminClient.auth.admin.deleteUser(createdUserId);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Unexpected provisioning failure.",
    };
  }
}
