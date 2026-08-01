import { NextResponse } from "next/server";

import {
  assertSafeRasterImage,
  type DetectedImageKind,
} from "@/lib/security/image-validation";
import { friendlyErrorMessage } from "@/lib/format";
import {
  isValidHexColor,
  isValidSupportEmail,
  isValidWebsiteUrl,
  normalizeHexColor,
} from "@/lib/branding";
import { requireMasterAdminApi } from "@/lib/master-admin/server";

const MAX_BYTES = 2 * 1024 * 1024;
const LOGO_KINDS = new Set<DetectedImageKind>(["png", "jpeg", "webp"]);
const FAVICON_KINDS = new Set<DetectedImageKind>([
  "png",
  "jpeg",
  "webp",
  "ico",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireMasterAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const { data, error } = await auth.supabase
    .from("company_branding")
    .select("*")
    .eq("company_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: friendlyErrorMessage(error.message, "Unable to load branding.") },
      { status: 400 },
    );
  }

  return NextResponse.json({ branding: data });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const supabase = auth.supabase;

    const { id: companyId } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";

    let primary_color: string | null = null;
    let secondary_color: string | null = null;
    let accent_color: string | null = null;
    let tagline: string | null = null;
    let support_email: string | null = null;
    let website_url: string | null = null;
    let clear_logo = false;
    let clear_favicon = false;
    let logoFile: File | null = null;
    let faviconFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      primary_color = String(form.get("primary_color") ?? "").trim() || null;
      secondary_color = String(form.get("secondary_color") ?? "").trim() || null;
      accent_color = String(form.get("accent_color") ?? "").trim() || null;
      tagline = String(form.get("tagline") ?? "").trim() || null;
      support_email = String(form.get("support_email") ?? "").trim() || null;
      website_url = String(form.get("website_url") ?? "").trim() || null;
      clear_logo = form.get("clear_logo") === "true";
      clear_favicon = form.get("clear_favicon") === "true";
      const logo = form.get("logo");
      const favicon = form.get("favicon");
      if (logo instanceof File && logo.size > 0) logoFile = logo;
      if (favicon instanceof File && favicon.size > 0) faviconFile = favicon;
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      primary_color = String(body.primary_color ?? "").trim() || null;
      secondary_color = String(body.secondary_color ?? "").trim() || null;
      accent_color = String(body.accent_color ?? "").trim() || null;
      tagline = String(body.tagline ?? "").trim() || null;
      support_email = String(body.support_email ?? "").trim() || null;
      website_url = String(body.website_url ?? "").trim() || null;
      clear_logo = Boolean(body.clear_logo);
      clear_favicon = Boolean(body.clear_favicon);
    }

    for (const [label, value] of [
      ["Primary color", primary_color],
      ["Secondary color", secondary_color],
      ["Accent color", accent_color],
    ] as const) {
      if (value && !isValidHexColor(value)) {
        return NextResponse.json(
          { error: `${label} must be a hex value like #0f766e.` },
          { status: 400 },
        );
      }
    }

    if (support_email && !isValidSupportEmail(support_email)) {
      return NextResponse.json(
        { error: "Support email is invalid." },
        { status: 400 },
      );
    }

    if (website_url && !isValidWebsiteUrl(website_url)) {
      return NextResponse.json(
        { error: "Website must be an http(s) URL." },
        { status: 400 },
      );
    }

    let logo_url: string | null | undefined;
    let favicon_url: string | null | undefined;

    async function uploadAsset(
      file: File,
      kind: "logo" | "favicon",
      allowed: Set<DetectedImageKind>,
    ) {
      if (file.size > MAX_BYTES) {
        throw new Error("Image must be 2MB or smaller.");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const detected = assertSafeRasterImage(buffer, allowed);
      const path = `${companyId}/${kind}.${detected.ext}`;
      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, buffer, {
          contentType: detected.mime,
          upsert: true,
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    }

    try {
      if (logoFile) {
        logo_url = await uploadAsset(logoFile, "logo", LOGO_KINDS);
        clear_logo = false;
      }
      if (faviconFile) {
        favicon_url = await uploadAsset(faviconFile, "favicon", FAVICON_KINDS);
        clear_favicon = false;
      }
    } catch (uploadErr) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            uploadErr,
            "Unable to upload branding image.",
          ),
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc(
      "master_upsert_company_branding",
      {
        p_company_id: companyId,
        p_logo_url: logo_url ?? null,
        p_favicon_url: favicon_url ?? null,
        p_primary_color: primary_color
          ? normalizeHexColor(primary_color)
          : null,
        p_secondary_color: secondary_color
          ? normalizeHexColor(secondary_color)
          : null,
        p_accent_color: accent_color ? normalizeHexColor(accent_color) : null,
        p_tagline: tagline,
        p_support_email: support_email,
        p_website_url: website_url,
        p_clear_logo: clear_logo,
        p_clear_favicon: clear_favicon,
      },
    );

    if (error || !data) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error?.message ?? "Failed",
            "Unable to update branding.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      branding: data,
      message: "Branding updated successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to update branding."),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const supabase = auth.supabase;

    const { id } = await context.params;
    const { error } = await supabase.rpc("master_reset_company_branding", {
      p_company_id: id,
    });

    if (error) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error.message,
            "Unable to reset branding.",
          ),
        },
        { status: 400 },
      );
    }

    // Best-effort storage cleanup
    const { data: files } = await supabase.storage.from("branding").list(id);
    if (files?.length) {
      await supabase.storage
        .from("branding")
        .remove(files.map((f) => `${id}/${f.name}`));
    }

    return NextResponse.json({
      message: "Branding reset to platform defaults.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to reset branding."),
      },
      { status: 500 },
    );
  }
}
