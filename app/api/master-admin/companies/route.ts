import { NextResponse } from "next/server";

import {
  isValidHexColor,
  isValidSupportEmail,
  isValidWebsiteUrl,
  normalizeHexColor,
} from "@/lib/branding";
import {
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  isAllowedCurrency,
  isValidSupportPhone,
  isValidTimezone,
  normalizeCurrency,
} from "@/lib/company-settings";
import { friendlyErrorMessage } from "@/lib/format";
import {
  createServiceRoleClient,
  generateTemporaryPassword,
  requireMasterAdminApi,
} from "@/lib/master-admin/server";
import { isValidCompanySlug, normalizeCompanySlug } from "@/lib/utils";

const MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const FAVICON_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function extForMime(mime: string) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ico";
    default:
      return "bin";
  }
}

type ProvisionFields = {
  company_name: string;
  company_slug: string;
  company_description: string | null;
  admin_full_name: string;
  admin_email: string;
  admin_phone: string | null;
  timezone: string;
  currency: string;
  support_email: string | null;
  support_phone: string | null;
  website_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  tagline: string | null;
  payment_received: boolean;
  payment_amount_cents: number | null;
  payment_currency: string | null;
  payment_method: "bank_transfer" | "cash" | "mobile_money" | "other" | null;
  payment_date: string | null;
  payment_reference: string | null;
  payment_notes: string | null;
  logoFile: File | null;
  faviconFile: File | null;
};

function parsePaymentMethod(
  value: string,
): ProvisionFields["payment_method"] {
  if (
    value === "bank_transfer" ||
    value === "cash" ||
    value === "mobile_money" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

function normalizeWebsiteUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildProvisionRpcArgs(
  fields: ProvisionFields,
  adminUserId: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    p_company_name: fields.company_name,
    p_company_slug: fields.company_slug,
    p_admin_user_id: adminUserId,
    p_admin_full_name: fields.admin_full_name,
    p_admin_email: fields.admin_email,
    p_payment_received: fields.payment_received,
  };

  if (fields.admin_phone) args.p_admin_phone = fields.admin_phone;
  if (fields.company_description) {
    args.p_company_description = fields.company_description;
  }
  if (fields.support_email) {
    args.p_company_email = fields.support_email;
    args.p_support_email = fields.support_email;
  }
  if (fields.support_phone) {
    args.p_company_phone = fields.support_phone;
    args.p_support_phone = fields.support_phone;
  }
  if (fields.timezone) args.p_timezone = fields.timezone;
  if (fields.currency) args.p_currency = fields.currency;
  if (fields.website_url) args.p_website_url = fields.website_url;
  if (fields.primary_color) {
    args.p_primary_color = normalizeHexColor(fields.primary_color);
  }
  if (fields.secondary_color) {
    args.p_secondary_color = normalizeHexColor(fields.secondary_color);
  }
  if (fields.accent_color) {
    args.p_accent_color = normalizeHexColor(fields.accent_color);
  }
  if (fields.tagline) args.p_tagline = fields.tagline;

  if (fields.payment_received) {
    args.p_payment_amount_cents = fields.payment_amount_cents;
    args.p_payment_currency = fields.payment_currency ?? "USD";
    args.p_payment_method = fields.payment_method;
    if (fields.payment_date) args.p_payment_date = fields.payment_date;
    if (fields.payment_reference) {
      args.p_payment_reference = fields.payment_reference;
    }
    if (fields.payment_notes) args.p_payment_notes = fields.payment_notes;
  }

  return args;
}

function provisionFailureMessage(raw: string | undefined | null): string {
  const message = (raw ?? "").trim();
  if (!message) {
    return "Unable to create the app. No usable tenant was created.";
  }
  const mapped = friendlyErrorMessage(message, "");
  // Always prefer a concrete DB/RPC message for Master Admin so setup can proceed.
  if (mapped) return mapped;
  if (message.length <= 280) return message;
  return "Unable to create the app. No usable tenant was created.";
}

async function parseProvisionBody(request: Request): Promise<ProvisionFields> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const logo = form.get("logo");
    const favicon = form.get("favicon");
    return {
      company_name: String(form.get("company_name") ?? "").trim(),
      company_slug: normalizeCompanySlug(
        String(form.get("company_slug") ?? ""),
      ),
      company_description:
        String(form.get("company_description") ?? "").trim() || null,
      admin_full_name: String(form.get("admin_full_name") ?? "").trim(),
      admin_email: String(form.get("admin_email") ?? "")
        .trim()
        .toLowerCase(),
      admin_phone: String(form.get("admin_phone") ?? "").trim() || null,
      timezone:
        String(form.get("timezone") ?? "").trim() || DEFAULT_TIMEZONE,
      currency: normalizeCurrency(
        String(form.get("currency") ?? DEFAULT_CURRENCY),
      ),
      support_email:
        String(form.get("support_email") ?? "").trim().toLowerCase() || null,
      support_phone: String(form.get("support_phone") ?? "").trim() || null,
      website_url: normalizeWebsiteUrl(
        String(form.get("website_url") ?? "").trim() || null,
      ),
      primary_color: String(form.get("primary_color") ?? "").trim() || null,
      secondary_color:
        String(form.get("secondary_color") ?? "").trim() || null,
      accent_color: String(form.get("accent_color") ?? "").trim() || null,
      tagline: String(form.get("tagline") ?? "").trim() || null,
      payment_received:
        String(form.get("payment_received") ?? "") === "true" ||
        String(form.get("payment_received") ?? "") === "1",
      payment_amount_cents: (() => {
        const raw = String(form.get("payment_amount_cents") ?? "").trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isInteger(n) ? n : null;
      })(),
      payment_currency:
        String(form.get("payment_currency") ?? "").trim().toUpperCase() ||
        null,
      payment_method: parsePaymentMethod(
        String(form.get("payment_method") ?? ""),
      ),
      payment_date: String(form.get("payment_date") ?? "").trim() || null,
      payment_reference:
        String(form.get("payment_reference") ?? "").trim() || null,
      payment_notes: String(form.get("payment_notes") ?? "").trim() || null,
      logoFile: logo instanceof File && logo.size > 0 ? logo : null,
      faviconFile:
        favicon instanceof File && favicon.size > 0 ? favicon : null,
    };
  }

  const body = (await request.json()) as Record<string, unknown>;
  return {
    company_name: String(body.company_name ?? "").trim(),
    company_slug: normalizeCompanySlug(String(body.company_slug ?? "")),
    company_description:
      String(body.company_description ?? "").trim() || null,
    admin_full_name: String(body.admin_full_name ?? "").trim(),
    admin_email: String(body.admin_email ?? "")
      .trim()
      .toLowerCase(),
    admin_phone: String(body.admin_phone ?? "").trim() || null,
    timezone: String(body.timezone ?? "").trim() || DEFAULT_TIMEZONE,
    currency: normalizeCurrency(String(body.currency ?? DEFAULT_CURRENCY)),
    support_email:
      String(body.support_email ?? "").trim().toLowerCase() || null,
    support_phone: String(body.support_phone ?? "").trim() || null,
    website_url: normalizeWebsiteUrl(
      String(body.website_url ?? "").trim() || null,
    ),
    primary_color: String(body.primary_color ?? "").trim() || null,
    secondary_color: String(body.secondary_color ?? "").trim() || null,
    accent_color: String(body.accent_color ?? "").trim() || null,
    tagline: String(body.tagline ?? "").trim() || null,
    payment_received: Boolean(body.payment_received),
    payment_amount_cents:
      body.payment_amount_cents != null
        ? Number(body.payment_amount_cents)
        : null,
    payment_currency:
      String(body.payment_currency ?? "").trim().toUpperCase() || null,
    payment_method: parsePaymentMethod(String(body.payment_method ?? "")),
    payment_date: String(body.payment_date ?? "").trim() || null,
    payment_reference: String(body.payment_reference ?? "").trim() || null,
    payment_notes: String(body.payment_notes ?? "").trim() || null,
    logoFile: null,
    faviconFile: null,
  };
}

function validateProvision(fields: ProvisionFields): string | null {
  if (!fields.company_name) return "Company name is required.";
  if (!fields.company_slug) return "Company slug is required.";
  if (!isValidCompanySlug(fields.company_slug)) {
    return "This app URL identifier must be lowercase letters, numbers, and hyphens.";
  }
  if (fields.company_description && fields.company_description.length > 500) {
    return "Description must be 500 characters or fewer.";
  }
  if (!fields.admin_full_name) return "Administrator name is required.";
  if (!fields.admin_email) return "Administrator email is required.";
  if (!isValidSupportEmail(fields.admin_email)) {
    return "Administrator email is invalid.";
  }
  if (!isValidTimezone(fields.timezone)) {
    return "Timezone is invalid.";
  }
  if (!isAllowedCurrency(fields.currency)) {
    return "Currency must be a supported ISO code.";
  }
  if (fields.support_email && !isValidSupportEmail(fields.support_email)) {
    return "Support email is invalid.";
  }
  if (fields.support_phone && !isValidSupportPhone(fields.support_phone)) {
    return "Support phone is invalid.";
  }
  if (fields.website_url && !isValidWebsiteUrl(fields.website_url)) {
    return "Website must be an http(s) URL.";
  }
  for (const [label, value] of [
    ["Primary color", fields.primary_color],
    ["Secondary color", fields.secondary_color],
    ["Accent color", fields.accent_color],
  ] as const) {
    if (value && !isValidHexColor(value)) {
      return `${label} must be a hex value like #0f766e.`;
    }
  }
  if (fields.payment_received) {
    if (
      fields.payment_amount_cents == null ||
      !Number.isInteger(fields.payment_amount_cents) ||
      fields.payment_amount_cents < 0
    ) {
      return "Payment amount must be an integer in cents.";
    }
    if (!fields.payment_method) {
      return "Payment method is required when payment is received.";
    }
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await requireMasterAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const slug = normalizeCompanySlug(searchParams.get("slug") ?? "");
  if (!slug) {
    return NextResponse.json(
      { error: "Slug is required.", available: false },
      { status: 400 },
    );
  }
  if (!isValidCompanySlug(slug)) {
    return NextResponse.json({
      available: false,
      slug,
      message: "Invalid slug format.",
    });
  }

  const { data, error } = await auth.supabase
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error.message, "Unable to check slug."),
        available: false,
      },
      { status: 400 },
    );
  }

  const available = !data;
  return NextResponse.json({
    slug,
    available,
    message: available ? "Slug available" : "Slug already exists",
  });
}

export async function POST(request: Request) {
  let createdUserId: string | null = null;
  let createdCompanyId: string | null = null;
  let adminClient: ReturnType<typeof createServiceRoleClient> | null = null;

  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const supabase = auth.supabase;

    const fields = await parseProvisionBody(request);
    const validationError = validateProvision(fields);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    try {
      adminClient = createServiceRoleClient();
    } catch {
      return NextResponse.json(
        {
          error:
            "App provisioning is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
        },
        { status: 500 },
      );
    }

    const password = generateTemporaryPassword();

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email: fields.admin_email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fields.admin_full_name },
      });

    if (createError || !created.user) {
      const raw = (createError?.message ?? "").toLowerCase();
      let error = "Unable to create administrator.";
      if (
        raw.includes("already") ||
        raw.includes("registered") ||
        raw.includes("exists")
      ) {
        error = "This administrator email is already in use.";
      }
      return NextResponse.json(
        {
          error: friendlyErrorMessage(createError?.message ?? error, error),
        },
        { status: 400 },
      );
    }

    createdUserId = created.user.id;

    const { data: result, error: provisionError } = await supabase.rpc(
      "master_provision_company",
      buildProvisionRpcArgs(fields, created.user.id) as never,
    );

    if (provisionError || !result) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      createdUserId = null;
      const message = provisionError?.message ?? "";
      console.error("master_provision_company failed", {
        message,
        code: provisionError?.code,
        details: provisionError?.details,
        hint: provisionError?.hint,
      });
      return NextResponse.json(
        {
          error: provisionFailureMessage(message),
          code: provisionError?.code ?? null,
          hint: provisionError?.hint ?? null,
        },
        { status: 400 },
      );
    }

    const provisioned =
      typeof result === "object" && result !== null
        ? (result as {
            company?: { id: string; name: string; slug?: string };
            admin?: unknown;
            settings?: unknown;
            branding?: unknown;
            payment?: unknown;
          })
        : null;
    const company = provisioned?.company ?? null;
    createdCompanyId = company?.id ?? null;

    if (!createdCompanyId || !company) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      createdUserId = null;
      console.error("master_provision_company returned no company", result);
      return NextResponse.json(
        {
          error:
            "Unable to create the app. The database returned an empty company. Run scripts/fix-provision-overloads.sql in Supabase, then try again.",
        },
        { status: 400 },
      );
    }

    async function uploadAsset(
      file: File,
      kind: "logo" | "favicon",
      allowed: Set<string>,
    ) {
      if (!createdCompanyId || !adminClient) {
        throw new Error("Missing company context for upload.");
      }
      if (file.size > MAX_BYTES) {
        throw new Error("Image must be 2MB or smaller.");
      }
      if (!allowed.has(file.type)) {
        throw new Error("Unsupported image type.");
      }
      const ext = extForMime(file.type);
      const path = `${createdCompanyId}/${kind}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      // Service role avoids Storage RLS edge cases during first-time provision.
      const { error: uploadError } = await adminClient.storage
        .from("branding")
        .upload(path, buffer, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = adminClient.storage.from("branding").getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    }

    let logo_url: string | null = null;
    let favicon_url: string | null = null;

    try {
      if (fields.logoFile) {
        logo_url = await uploadAsset(fields.logoFile, "logo", LOGO_TYPES);
      }
      if (fields.faviconFile) {
        favicon_url = await uploadAsset(
          fields.faviconFile,
          "favicon",
          FAVICON_TYPES,
        );
      }

      if (logo_url || favicon_url) {
        const { error: brandError } = await supabase.rpc(
          "master_upsert_company_branding",
          {
            p_company_id: createdCompanyId!,
            p_logo_url: logo_url,
            p_favicon_url: favicon_url,
            p_primary_color: fields.primary_color
              ? normalizeHexColor(fields.primary_color)
              : null,
            p_secondary_color: fields.secondary_color
              ? normalizeHexColor(fields.secondary_color)
              : null,
            p_accent_color: fields.accent_color
              ? normalizeHexColor(fields.accent_color)
              : null,
            p_tagline: fields.tagline,
            p_support_email: fields.support_email,
            p_website_url: fields.website_url,
            p_clear_logo: false,
            p_clear_favicon: false,
          },
        );
        if (brandError) throw new Error(brandError.message);
      }
    } catch (uploadErr) {
      // Compensating cleanup — do not leave a half-usable tenant after logo failure
      if (process.env.NODE_ENV === "development") {
        console.error("provision branding upload", uploadErr);
      }
      if (createdCompanyId) {
        const { data: files } = await supabase.storage
          .from("branding")
          .list(createdCompanyId);
        if (files?.length) {
          await supabase.storage
            .from("branding")
            .remove(files.map((f) => `${createdCompanyId}/${f.name}`));
        }
        await supabase.rpc("master_rollback_company_provision", {
          p_company_id: createdCompanyId,
        });
        createdCompanyId = null;
      }
      if (createdUserId && adminClient) {
        await adminClient.auth.admin.deleteUser(createdUserId);
        createdUserId = null;
      }
      return NextResponse.json(
        {
          error: provisionFailureMessage(
            uploadErr instanceof Error ? uploadErr.message : null,
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      company,
      admin: provisioned?.admin ?? null,
      settings: provisioned?.settings ?? null,
      branding: provisioned?.branding ?? null,
      payment: provisioned?.payment ?? null,
      temporary_password: password,
      admin_email: fields.admin_email,
      message:
        "App created successfully. Share the administrator credentials securely. The password is shown only once.",
    });
  } catch (error) {
    console.error("POST /api/master-admin/companies", error);

    try {
      const auth = await requireMasterAdminApi();
      if (auth.ok && createdCompanyId) {
        await auth.supabase.rpc("master_rollback_company_provision", {
          p_company_id: createdCompanyId,
        });
      }
      if (createdUserId && adminClient) {
        await adminClient.auth.admin.deleteUser(createdUserId);
      }
    } catch (cleanupError) {
      if (process.env.NODE_ENV === "development") {
        console.error("provision cleanup failed", cleanupError);
      }
    }

    return NextResponse.json(
      {
        error: friendlyErrorMessage(
          error instanceof Error ? error.message : error,
          "Unable to create the app. No usable tenant was created. Please try again.",
        ),
      },
      { status: 500 },
    );
  }
}
