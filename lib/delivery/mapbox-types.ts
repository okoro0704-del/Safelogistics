/** Shared Mapbox GL types used with the CDN-loaded SDK. */

export type LngLatLike =
  | [number, number]
  | { lng: number; lat: number }
  | { lon: number; lat: number };

export type FitBoundsOptions = {
  padding?:
    | number
    | { top: number; bottom: number; left: number; right: number };
  maxZoom?: number;
  duration?: number;
};

export type EaseToOptions = {
  center?: LngLatLike;
  zoom?: number;
  duration?: number;
  padding?: number;
};

export type MapOptions = {
  container: HTMLElement | string;
  style: string;
  center?: LngLatLike;
  zoom?: number;
  attributionControl?: boolean;
  accessToken?: string;
};

export type GeoJSONSource = {
  setData: (data: unknown) => void;
};

export type MapMouseEvent = {
  originalEvent?: Event;
};

export type MapboxMap = {
  addControl: (control: unknown, position?: string) => MapboxMap;
  addSource: (id: string, source: { type: "geojson"; data: unknown }) => MapboxMap;
  addLayer: (layer: Record<string, unknown>) => MapboxMap;
  getSource: (id: string) => GeoJSONSource | undefined;
  getLayer: (id: string) => unknown;
  remove: () => void;
  on: (type: string, listener: (e?: MapMouseEvent) => void) => MapboxMap;
  once: (type: string, listener: (e?: MapMouseEvent) => void) => MapboxMap;
  isStyleLoaded: () => boolean;
  fitBounds: (bounds: LngLatBounds, options?: FitBoundsOptions) => MapboxMap;
  easeTo: (options: EaseToOptions) => MapboxMap;
  resize: () => MapboxMap;
};

export type LngLatBounds = {
  extend: (lngLat: LngLatLike) => LngLatBounds;
};

export type MapboxMarker = {
  setLngLat: (lngLat: LngLatLike) => MapboxMarker;
  setPopup: (popup: MapboxPopup) => MapboxMarker;
  addTo: (map: MapboxMap) => MapboxMarker;
  remove: () => MapboxMarker;
};

export type MapboxPopup = {
  setHTML: (html: string) => MapboxPopup;
  remove: () => MapboxPopup;
};

export type MapboxGL = {
  accessToken: string;
  Map: new (options: MapOptions) => MapboxMap;
  Marker: new (options?: {
    element?: HTMLElement;
    anchor?: string;
  }) => MapboxMarker;
  Popup: new (options?: {
    offset?: number;
    closeButton?: boolean;
    maxWidth?: string;
  }) => MapboxPopup;
  NavigationControl: new (options?: { showCompass?: boolean }) => unknown;
  FullscreenControl: new () => unknown;
  LngLatBounds: new (sw?: LngLatLike, ne?: LngLatLike) => LngLatBounds;
};

declare global {
  interface Window {
    mapboxgl?: MapboxGL;
  }
}

export {};
