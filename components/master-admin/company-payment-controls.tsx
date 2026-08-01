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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  formatMoneyCents,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
} from "@/lib/payments/constants";
import type { ManualPaymentMethod, Payment } from "@/lib/types/database";

type DialogKind = "record" | "void" | null;

export function CompanyPaymentControls({
  companyId,
  companyName,
  payments,
  defaultCurrency = "USD",
}: {
  companyId: string;
  companyName: string;
  payments: Payment[];
  defaultCurrency?: string;
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);

  const [amountCents, setAmountCents] = useState("0");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [method, setMethod] = useState<ManualPaymentMethod>("bank_transfer");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [voidReason, setVoidReason] = useState("");

  function close() {
    if (!pending) setDialog(null);
  }

  function patch(body: Record<string, unknown>) {
    startTransition(async () => {
      const response = await fetch(
        `/api/master-admin/companies/${companyId}/payments`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toastError(payload.error ?? "Unable to update payment.");
        return;
      }
      success("Payment updated.");
      setDialog(null);
      setVoidTarget(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setDialog("record")}>
          Record payment
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
        ) : (
          payments.map((payment) => (
            <div
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {formatMoneyCents(payment.amount_cents, payment.currency)} ·{" "}
                  {PAYMENT_METHOD_LABELS[payment.payment_method]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {payment.payment_date}
                  {payment.reference ? ` · ${payment.reference}` : ""} ·{" "}
                  {payment.status}
                </p>
              </div>
              {payment.status === "recorded" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setVoidTarget(payment);
                    setDialog("void");
                  }}
                >
                  Void
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <Dialog open={dialog === "record"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Offline payment received for {companyName}. No card data is
              collected.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Amount (cents)</Label>
              <Input
                inputMode="numeric"
                value={amountCents}
                onChange={(e) => setAmountCents(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {formatMoneyCents(Number(amountCents) || 0, currency)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as ManualPaymentMethod)
                }
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                patch({
                  action: "record_payment",
                  amount_cents: Number(amountCents),
                  currency,
                  payment_method: method,
                  payment_date: paymentDate,
                  reference: reference || null,
                  notes: notes || null,
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "void"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void payment</DialogTitle>
            <DialogDescription>
              Marks the payment as voided. The original record remains visible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !voidTarget}
              onClick={() =>
                patch({
                  action: "void_payment",
                  payment_id: voidTarget!.id,
                  reason: voidReason || null,
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Void"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
