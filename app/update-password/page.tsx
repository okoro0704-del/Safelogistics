import type { Metadata } from "next";

import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = {
  title: "Update password",
};

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfdf5_0%,_#eef2f6_45%,_#f4f6f8_100%)] px-4 py-10">
      <UpdatePasswordForm />
    </div>
  );
}
