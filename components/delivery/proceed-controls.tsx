"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

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
import { proceedToNextStopAction } from "@/lib/admin/actions";
import { proceedButtonLabel } from "@/lib/delivery/view-model";
import type { DeliveryStop } from "@/lib/types/database";

export function ProceedControls({
  deliveryId,
  trackingNumber,
  currentStop,
  nextStop,
  canProceed,
  isDelivered,
  isCancelled,
  onAdvanced,
  onError,
}: {
  deliveryId: string;
  trackingNumber: string;
  currentStop: DeliveryStop | null;
  nextStop: DeliveryStop | null;
  canProceed: boolean;
  isDelivered: boolean;
  isCancelled: boolean;
  onAdvanced: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { success, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isCancelled) {
    return (
      <div
        className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-5 text-center"
        role="status"
      >
        <p className="font-semibold text-destructive">Delivery Cancelled</p>
        <p className="mt-1 text-sm text-destructive/80">
          Movement is disabled for cancelled deliveries.
        </p>
      </div>
    );
  }

  if (isDelivered) {
    return (
      <div
        className="rounded-xl border border-success/20 bg-success/10 px-4 py-5 text-center"
        role="status"
      >
        <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-5" aria-hidden />
        </div>
        <p className="font-semibold text-success">✓ Delivered</p>
        <p className="mt-1 text-sm text-success/90">
          This delivery has reached its destination.
        </p>
      </div>
    );
  }

  if (!canProceed) {
    return null;
  }

  const label = proceedButtonLabel(nextStop);

  function confirmProceed() {
    if (pending) return;
    startTransition(async () => {
      setSuccessMessage(null);
      const result = await proceedToNextStopAction(deliveryId);
      if (!result.ok) {
        setOpen(false);
        onError(result.error);
        toastError("Unable to advance delivery.");
        await onAdvanced();
        return;
      }

      setOpen(false);
      const message = result.data.is_delivered
        ? "Delivery marked as delivered."
        : nextStop
          ? `Delivery advanced to ${nextStop.name}`
          : "Delivery advanced successfully.";
      setSuccessMessage(message);
      success(message);
      await onAdvanced();
    });
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        className="h-12 w-full text-base"
        disabled={pending}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Proceeding...
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="size-4" aria-hidden />
          </>
        )}
      </Button>

      {successMessage ? (
        <p className="text-center text-sm text-success" role="status">
          {successMessage}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proceed Delivery?</DialogTitle>
            <DialogDescription>
              This will move tracking for{" "}
              <span className="font-mono font-medium text-foreground">
                {trackingNumber}
              </span>{" "}
              to the next stop.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current Location
              </p>
              <p className="mt-1 font-medium">
                {currentStop?.name ?? "Current stop"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {nextStop ? "Next Stop" : "Action"}
              </p>
              <p className="mt-1 font-medium">
                {nextStop
                  ? nextStop.name
                  : "Mark as delivered at final destination"}
              </p>
            </div>
            <p className="text-muted-foreground">
              This will move the delivery to the next stop. Progress stops until
              you proceed again.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={confirmProceed}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Proceeding...
                </>
              ) : (
                "Proceed"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
