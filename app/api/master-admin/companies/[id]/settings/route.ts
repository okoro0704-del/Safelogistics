import { NextResponse } from "next/server";

import {
  isValidSupportEmail,
  isValidWebsiteUrl,
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
import { requireMasterAdminApi } from "@/lib/master-admin/server";

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
    .from("company_settings")
    .select("*")
    .eq("company_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error.message, "Unable to load settings."),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    settings: data ?? {
      company_id: id,
      timezone: DEFAULT_TIMEZONE,
      currency: DEFAULT_CURRENCY,
      support_email: null,
      support_phone: null,
      website_url: null,
    },
  });
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
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const timezone =
      String(body.timezone ?? "").trim() || DEFAULT_TIMEZONE;
    const currency = normalizeCurrency(
      String(body.currency ?? DEFAULT_CURRENCY),
    );
    const support_email =
      String(body.support_email ?? "").trim().toLowerCase() || null;
    const support_phone = String(body.support_phone ?? "").trim() || null;
    const website_url = String(body.website_url ?? "").trim() || null;

    if (!isValidTimezone(timezone)) {
      return NextResponse.json(
        { error: "Timezone is invalid." },
        { status: 400 },
      );
    }
    if (!isAllowedCurrency(currency)) {
      return NextResponse.json(
        { error: "Currency must be a supported ISO code." },
        { status: 400 },
      );
    }
    if (support_email && !isValidSupportEmail(support_email)) {
      return NextResponse.json(
        { error: "Support email is invalid." },
        { status: 400 },
      );
    }
    if (support_phone && !isValidSupportPhone(support_phone)) {
      return NextResponse.json(
        { error: "Support phone is invalid." },
        { status: 400 },
      );
    }
    if (website_url && !isValidWebsiteUrl(website_url)) {
      return NextResponse.json(
        { error: "Website must be an http(s) URL." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("master_upsert_company_settings", {
      p_company_id: id,
      p_timezone: timezone,
      p_currency: currency,
      p_support_email: support_email,
      p_support_phone: support_phone,
      p_website_url: website_url,
    });

    if (error || !data) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            error?.message ?? "Failed",
            "Unable to save company settings.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      settings: data,
      message: "Company settings saved.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to save company settings."),
      },
      { status: 500 },
    );
  }
}
