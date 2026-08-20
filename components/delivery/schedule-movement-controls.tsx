"use client";

import { useMemo, useState, useTransition } from "react";
import { Clock3, Loader2, Plane } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { scheduleDeliveryMovementAction } from "@/lib/admin/actions";
import { formatDateTime } from "@/lib/format";
import type { DeliveryMovement } from "@/lib/types/database";
import type { DeliveryStop } from "@/lib/types/database";

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleMovementControls({
  deliveryId,
  currentStop,
  nextStop,
  canSchedule,
  activeMovement,
  onScheduled,
  onError,
}: {
  deliveryId: string;
  currentStop: DeliveryStop | null;
  nextStop: DeliveryStop | null;
  canSchedule: boolean;
  activeMovement: DeliveryMovement | null;
  onScheduled: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date()));
  const [hours, setHours] = useState("2");
  const [minutes, setMinutes] = useState("0");

  const durationMinutes = useMemo(() => {
    const h = Number(hours);
    const m = Number(minutes);
    const total =
      (Number.isFinite(h) ? Math.max(0, h) : 0) * 60 +
      (Number.isFinite(m) ? Math.max(0, m) : 0);
    return total;
  }, [hours, minutes]);

  if (activeMovement) {
    return (
      <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Plane className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold text-foreground">Movement in progress</p>
            <p className="text-sm text-muted-foreground">
              From <span className="font-medium text-foreground">{activeMovement.from.name}</span>
              {" → "}
              <span className="font-medium text-foreground">{activeMovement.to.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Starts {formatDateTime(activeMovement.started_at)} ·{" "}
              {activeMovement.duration_minutes} min · ends{" "}
              {formatDateTime(activeMovement.ends_at)}
            </p>
            <p className="text-xs text-muted-foreground">
              Trackers show a moving beacon on the map during this window.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canSchedule || !nextStop) {
    return null;
  }

  function submit() {
    if (pending) return;
    if (durationMinutes < 1) {
      onError("Set a transit duration of at least 1 minute.");
      toastError("Duration must be at least 1 minute.");
      return;
    }
    startTransition(async () => {
      const result = await scheduleDeliveryMovementAction(
        deliveryId,
        new Date(startsAt).toISOString(),
        durationMinutes,
      );
      if (!result.ok) {
        onError(result.error);
        toastError("Unable to schedule movement.");
        return;
      }
      success(
        `Movement scheduled: ${currentStop?.name ?? "current"} → ${nextStop!.name}`,
      );
      await onScheduled();
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Clock3 className="size-4" aria-hidden />
        </div>
        <div>
          <p className="font-semibold text-foreground">Schedule movement</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set when the parcel leaves{" "}
            <span className="font-medium text-foreground">
              {currentStop?.name ?? "the current stop"}
            </span>{" "}
            and how long it takes to reach{" "}
            <span className="font-medium text-foreground">{nextStop.name}</span>.
            During that window, trackers see it moving on the map.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="movement-start">Movement starts</Label>
          <Input
            id="movement-start"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="movement-hours">Hours in transit</Label>
          <Input
            id="movement-hours"
            type="number"
            min={0}
            max={168}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="movement-minutes">Extra minutes</Label>
          <Input
            id="movement-minutes"
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            className="w-full"
            disabled={pending || durationMinutes < 1}
            onClick={submit}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Scheduling…
              </>
            ) : (
              "Start timed movement"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
