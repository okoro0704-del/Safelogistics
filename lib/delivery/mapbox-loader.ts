import type { MapboxGL } from "@/lib/delivery/mapbox-types";

const MAPBOX_VERSION = "3.9.4";
const MAPLIBRE_VERSION = "4.7.1";
const SCRIPT_ID = "map-gl-js-cdn";
const CSS_ID = "map-gl-css-cdn";

let loadingPromise: Promise<MapboxGL> | null = null;

function loadStylesheet(href: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error("Unable to load map stylesheet."));
    document.head.appendChild(link);
  });
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (window.mapboxgl || (window as unknown as { maplibregl?: MapboxGL }).maplibregl) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Unable to load map script.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load map script."));
    document.body.appendChild(script);
  });
}

/**
 * Prefer Mapbox when a public token is present; otherwise load MapLibre + free
 * OSM raster style so maps never render blank for missing Mapbox billing.
 */
export async function loadMapboxGL(): Promise<MapboxGL> {
  if (typeof window === "undefined") {
    throw new Error("Map can only load in the browser.");
  }

  const token = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
  const win = window as unknown as {
    mapboxgl?: MapboxGL;
    maplibregl?: MapboxGL;
  };

  if (token && win.mapboxgl) return win.mapboxgl;
  if (!token && win.maplibregl) return win.maplibregl;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    if (token) {
      const base = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}`;
      await loadStylesheet(`${base}/mapbox-gl.css`, CSS_ID);
      await loadScript(`${base}/mapbox-gl.js`, SCRIPT_ID);
      if (!win.mapboxgl) throw new Error("Mapbox failed to initialize.");
      return win.mapboxgl;
    }

    const base = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist`;
    await loadStylesheet(`${base}/maplibre-gl.css`, CSS_ID);
    await loadScript(`${base}/maplibre-gl.js`, SCRIPT_ID);
    if (!win.maplibregl) throw new Error("MapLibre failed to initialize.");
    // Expose as mapboxgl for existing call sites
    win.mapboxgl = win.maplibregl;
    return win.maplibregl;
  })();

  try {
    return await loadingPromise;
  } catch (error) {
    loadingPromise = null;
    throw error;
  }
}

export function getMapStyle(): string | Record<string, unknown> {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
  if (token) return "mapbox://styles/mapbox/light-v11";
  // Free OSM raster style (no API key)
  return {
    version: 8,
    name: "OSM",
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

export function hasMapboxToken(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim());
}

export { MAPBOX_VERSION };
