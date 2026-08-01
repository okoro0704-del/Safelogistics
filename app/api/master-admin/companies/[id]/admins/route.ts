import { NextResponse } from "next/server";

import { friendlyErrorMessage } from "@/lib/format";
import {
  createServiceRoleClient,
  generateTemporaryPassword,
  requireMasterAdminApi,
} from "@/lib/master-admin/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMasterAdminApi();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: companyId } = await context.params;
    const body = (await request.json()) as {
      full_name?: string;
      email?: string;
      phone?: string;
    };

    const fullName = body.full_name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const phone = body.phone?.trim() || null;
    const password = generateTemporaryPassword();

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Admin name and email are required." },
        { status: 400 },
      );
    }

    let adminClient;
    try {
      adminClient = createServiceRoleClient();
    } catch {
      return NextResponse.json(
        {
          error:
            "Admin creation is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
        },
        { status: 500 },
      );
    }

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError || !created.user) {
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            createError?.message ?? "Failed",
            "Unable to create administrator.",
          ),
        },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await auth.supabase.rpc(
      "master_register_company_admin",
      {
        p_company_id: companyId,
        p_admin_user_id: created.user.id,
        p_admin_full_name: fullName,
        p_admin_email: email,
        p_admin_phone: phone,
      },
    );

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            profileError?.message ?? "Failed",
            "Unable to create administrator.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      profile,
      temporary_password: password,
      email,
      message:
        "Administrator created. Share the credentials securely. The password is shown only once.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyErrorMessage(error, "Unable to create administrator."),
      },
      { status: 500 },
    );
  }
}
