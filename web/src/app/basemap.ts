// The Omnium basemap, shared by the start page background and the address page map.
// Kartverket raster tiles are finished images, so we can't recolour single features. Instead we take the colour
// `topo` map and soften it toward the logo: less saturation, lifted shadows, a warm paper background showing through.
import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { cssVar } from "./dom";

// Let Vite bundle MapLibre's web worker (it can't find it on its own after bundling). Runs before any map exists.
setWorkerUrl(workerUrl);

const kartverket = (layer: string) =>
  `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/{z}/{y}/{x}.png`;

export function basemapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [kartverket("topo")],
        tileSize: 256,
        maxzoom: 18,
        attribution: "© Kartverket",
      },
    },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": cssVar("--map-land") } },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: {
          "raster-opacity": 0.85,
          "raster-saturation": -0.45,
          "raster-contrast": -0.2,
          "raster-brightness-min": 0.12,
          "raster-hue-rotate": -6,
        },
      },
    ],
  };
}
