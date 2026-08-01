import { NextResponse } from "next/server";

import { friendlyErrorMessage } from "@/lib/format";
import { generateTemporaryPassword } from "@/lib/master-admin/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Profile } from "@/lib/types/database";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      full_name?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const password =
      body.password && body.password.length >= 8
        ? body.password
        : generateTemporaryPassword();

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Full name and email are required." },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError || !isAdmin) {
      return NextResponse.json(
        { error: "Only company admins can create customers." },
        { status: 403 },
      );
    }

    let adminClient;
    try {
      adminClient = createServiceRoleClient();
    } catch {
      return NextResponse.json(
        {
          error:
            "Customer creation is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
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
            createError?.message ?? "Failed to create auth user",
            "We couldn't create this customer. Please try again.",
          ),
        },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabase.rpc(
      "admin_register_customer_profile",
      {
        p_user_id: created.user.id,
        p_full_name: fullName,
        p_email: email,
        p_phone: phone,
      },
    );

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        {
          error: friendlyErrorMessage(
            profileError?.message ?? "Failed to create profile",
            "We couldn't create this customer profile. Please try again.",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      user_id: created.user.id,
      email,
      temporary_password: password,
      profile: profile as Profile,
      message:
        "Customer created. Share the login credentials with the customer securely.",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("POST /api/admin/customers", error);
    }
    return NextResponse.json(
      {
        error: friendlyErrorMessage(
          error,
          "We couldn't create this customer. Please try again.",
        ),
      },
      { status: 500 },
    );
  }
}
