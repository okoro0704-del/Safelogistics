import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfdf5_0%,_#eef2f6_45%,_#f4f6f8_100%)] px-4 py-10">
      <ForgotPasswordForm />
    </div>
  );
}
