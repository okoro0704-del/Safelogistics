"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyTrackingNumber({
  trackingNumber,
  className,
  showLabel = false,
}: {
  trackingNumber: string;
  className?: string;
  showLabel?: boolean;
}) {
  const { success } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      success("Tracking number copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / denied clipboard
      const input = document.createElement("textarea");
      input.value = trackingNumber;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      success("Tracking number copied");
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5 font-mono", className)}
      onClick={() => void copy()}
      aria-label={`Copy tracking number ${trackingNumber}`}
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {showLabel ? (copied ? "Copied" : "Copy") : null}
    </Button>
  );
}

export function TrackingNumberDisplay({
  trackingNumber,
  className,
}: {
  trackingNumber: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <span className="select-all font-mono text-lg font-semibold tracking-tight md:text-xl">
        {trackingNumber}
      </span>
      <CopyTrackingNumber trackingNumber={trackingNumber} showLabel />
    </div>
  );
}
