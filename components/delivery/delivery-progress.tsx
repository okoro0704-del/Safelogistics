import type { DeliveryStop } from "@/lib/types/database";

export function DeliveryProgress({
  stops,
  progressPercent,
}: {
  stops: DeliveryStop[];
  progressPercent: number;
}) {
  const labels = stops.map((stop) => stop.name).join(" → ");

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Route progress
          </p>
          <p className="mt-1 truncate text-sm text-foreground" title={labels}>
            {labels || "No stops"}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {progressPercent}%
        </p>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Route progress ${progressPercent} percent`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
