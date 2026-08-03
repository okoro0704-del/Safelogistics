import type { Metadata } from "next";

import { MasterAdminSetupForm } from "@/components/auth/master-admin-setup-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create Master Admin",
  robots: { index: false, follow: false },
};

export default function MasterAdminSetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfdf5_0%,_#eef2f6_45%,_#f4f6f8_100%)] px-4 py-10">
      <MasterAdminSetupForm />
    </div>
  );
}
