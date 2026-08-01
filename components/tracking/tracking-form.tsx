"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isValidTrackingNumber,
  normalizeTrackingNumber,
} from "@/lib/utils";

export function TrackingForm({
  initialValue = "",
  compact = false,
}: {
  initialValue?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTrackingNumber(value);

    if (!normalized) {
      setError("Enter a tracking number.");
      return;
    }

    if (!isValidTrackingNumber(normalized)) {
      setError("Use the format DLV-YYYY-000000.");
      return;
    }

    setError(null);
    setPending(true);
    router.push(`/track?number=${encodeURIComponent(normalized)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className={compact ? "space-y-3" : "space-y-4"}
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="tracking-number">Tracking number</Label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id="tracking-number"
            name="tracking-number"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="DLV-2026-000001"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tracking-error" : undefined}
            className="font-mono uppercase"
            autoComplete="off"
          />
          <Button type="submit" disabled={pending} className="sm:min-w-40">
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Looking up…
              </>
            ) : (
              <>
                <Search className="size-4" aria-hidden />
                Track
              </>
            )}
          </Button>
        </div>
      </div>
      {error ? (
        <p id="tracking-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
