"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RouteStopInput } from "@/lib/types/database";

export type EditableStop = RouteStopInput & { key: string };

function createStop(partial?: Partial<RouteStopInput>): EditableStop {
  return {
    key: crypto.randomUUID(),
    name: partial?.name ?? "",
    latitude: partial?.latitude ?? 0,
    longitude: partial?.longitude ?? 0,
  };
}

export function createInitialStops(): EditableStop[] {
  return [
    createStop({ name: "", latitude: 0, longitude: 0 }),
    createStop({ name: "", latitude: 0, longitude: 0 }),
  ];
}

export function StopEditor({
  stops,
  onChange,
}: {
  stops: EditableStop[];
  onChange: (stops: EditableStop[]) => void;
}) {
  function updateStop(key: string, patch: Partial<RouteStopInput>) {
    onChange(
      stops.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)),
    );
  }

  function moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  }

  function removeStop(key: string) {
    if (stops.length <= 2) return;
    onChange(stops.filter((stop) => stop.key !== key));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Route</h2>
          <p className="text-sm text-muted-foreground">
            Origin first, destination last. Add intermediate stops as needed.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = [...stops];
            next.splice(stops.length - 1, 0, createStop());
            onChange(next);
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add Stop
        </Button>
      </div>

      <div className="space-y-0">
        {stops.map((stop, index) => {
          const role =
            index === 0
              ? "Origin"
              : index === stops.length - 1
                ? "Destination"
                : `Stop ${index}`;

          return (
            <div key={stop.key}>
              {index > 0 ? (
                <div
                  className="flex justify-center py-1 text-muted-foreground"
                  aria-hidden
                >
                  <span className="text-lg leading-none">↓</span>
                </div>
              ) : null}
              <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  {role}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move stop up"
                    disabled={index === 0}
                    onClick={() => moveStop(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move stop down"
                    disabled={index === stops.length - 1}
                    onClick={() => moveStop(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove stop"
                    disabled={stops.length <= 2}
                    onClick={() => removeStop(stop.key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor={`stop-name-${stop.key}`}>Location name</Label>
                  <Input
                    id={`stop-name-${stop.key}`}
                    value={stop.name}
                    onChange={(event) =>
                      updateStop(stop.key, { name: event.target.value })
                    }
                    placeholder="e.g. Lagos"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`stop-lat-${stop.key}`}>Latitude</Label>
                  <Input
                    id={`stop-lat-${stop.key}`}
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    value={Number.isFinite(stop.latitude) ? stop.latitude : ""}
                    onChange={(event) =>
                      updateStop(stop.key, {
                        latitude: Number(event.target.value),
                      })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`stop-lng-${stop.key}`}>Longitude</Label>
                  <Input
                    id={`stop-lng-${stop.key}`}
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    value={Number.isFinite(stop.longitude) ? stop.longitude : ""}
                    onChange={(event) =>
                      updateStop(stop.key, {
                        longitude: Number(event.target.value),
                      })
                    }
                    required
                  />
                </div>
              </div>
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function useStopEditor(initial = createInitialStops()) {
  const [stops, setStops] = useState<EditableStop[]>(initial);
  return { stops, setStops };
}
