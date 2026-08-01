"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { CompanyStatus } from "@/lib/types/database";

export function CompanyStatusControls({
  companyId,
  companyName,
  status,
}: {
  companyId: string;
  companyName: string;
  status: CompanyStatus;
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const nextStatus: CompanyStatus =
    status === "active" ? "suspended" : "active";

  function apply() {
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to update company status.");
        setOpen(false);
        return;
      }
      success(payload.message ?? "Company updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={status === "active" ? "destructive" : "default"}
        onClick={() => setOpen(true)}
      >
        {status === "active" ? "Suspend company" : "Activate company"}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {status === "active" ? "Suspend" : "Activate"} {companyName}?
            </DialogTitle>
            <DialogDescription>
              {status === "active"
                ? "Users belonging to this company will no longer be able to operate the delivery platform normally. Delivery history is preserved."
                : "Company admins and customers will regain normal access."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={status === "active" ? "destructive" : "default"}
              disabled={pending}
              onClick={apply}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : status === "active" ? (
                "Suspend Company"
              ) : (
                "Activate Company"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
