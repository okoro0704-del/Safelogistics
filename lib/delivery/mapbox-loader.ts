import type { MapboxGL } from "@/lib/delivery/mapbox-types";

const MAPBOX_VERSION = "3.9.4";
const SCRIPT_ID = "mapbox-gl-js-cdn";
const CSS_ID = "mapbox-gl-css-cdn";

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
    link.onerror = () =>
      reject(new Error("Unable to load Mapbox stylesheet."));
    document.head.appendChild(link);
  });
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (window.mapboxgl) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Unable to load Mapbox script.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Mapbox script."));
    document.body.appendChild(script);
  });
}

/**
 * Loads the official Mapbox GL JS SDK (pinned) in the browser via CDN.
 * Isolated from delivery business logic so a future white-label config
 * can swap provider/style without touching movement RPCs.
 */
export async function loadMapboxGL(): Promise<MapboxGL> {
  if (typeof window === "undefined") {
    throw new Error("Mapbox can only load in the browser.");
  }
  if (window.mapboxgl) {
    return window.mapboxgl;
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const base = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}`;
    await loadStylesheet(`${base}/mapbox-gl.css`, CSS_ID);
    await loadScript(`${base}/mapbox-gl.js`, SCRIPT_ID);
    if (!window.mapboxgl) {
      throw new Error("Mapbox failed to initialize.");
    }
    return window.mapboxgl;
  })();

  try {
    return await loadingPromise;
  } catch (error) {
    loadingPromise = null;
    throw error;
  }
}

export { MAPBOX_VERSION };
