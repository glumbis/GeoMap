// The map on the address page: Kartverket basemap, warmed up to sit on the paper colour, strictly top-down.
// Map layer files in src/features/ get the map once it has loaded: export default function (map: Map).
import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { cssVar } from "./dom";

// Let Vite bundle MapLibre's web worker (it can't find it on its own after bundling).
setWorkerUrl(workerUrl);

const kartverket = (layer: string) =>
  `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/{z}/{y}/{x}.png`;

const features = import.meta.glob<{ default: (map: Map) => void | Promise<void> }>("../features/*.ts", { eager: true });

let map: Map | undefined;
let pin: Marker | undefined;

function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-pin";
  // Orange teardrop with a white dot, as in the logo.
  el.innerHTML = `<svg viewBox="0 0 32 44" aria-hidden="true">
    <path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.5 16 43 16 43s15-16.5 15-27.2C31 7.6 24.3 1 16 1z" fill="var(--orange)" stroke="#fff" stroke-width="2"/>
    <circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>`;
  return el;
}

/** Show the map in `container`, centred on the address. Reuses the map if it is already there. */
export function showMap(container: HTMLElement, lng: number, lat: number) {
  if (map && map.getContainer() !== container) destroyMap();

  if (!map) {
    map = new Map({
      container,
      center: [lng, lat],
      zoom: 16,
      // Top-down only: no tilt, no rotation.
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: [kartverket("topograatone")],
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
            // Grey tiles over the warm background: lower opacity lets the paper colour through.
            paint: { "raster-opacity": 0.78, "raster-contrast": -0.1, "raster-brightness-min": 0.08 },
          },
        ],
      },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new ScaleControl(), "bottom-left");
    if (import.meta.env.DEV) Object.assign(window, { map }); // debug in the browser console: map.getStyle()

    const m = map;
    m.on("load", () => {
      for (const [path, mod] of Object.entries(features)) {
        // One broken feature never takes down the others.
        Promise.resolve()
          .then(() => mod.default(m))
          .catch((err) => console.error(`feature ${path} failed`, err));
      }
    });
  } else {
    map.resize();
    map.jumpTo({ center: [lng, lat], zoom: 16 });
  }

  pin?.remove();
  pin = new Marker({ element: pinElement(), anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
}

export function destroyMap() {
  pin?.remove();
  map?.remove();
  map = undefined;
  pin = undefined;
}
