import { Map, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./style.css";

// Let Vite bundle MapLibre's web worker (it can't find it on its own after bundling).
setWorkerUrl(workerUrl);

const kartverket = (layer: string) =>
  `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/{z}/{y}/{x}.png`;

const map = new Map({
  container: "map",
  center: [10.75, 59.91], // Oslo, [lng, lat]
  zoom: 10,
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
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  },
});
if (import.meta.env.DEV) Object.assign(window, { map }); // debug in the browser console: map.getStyle()
map.addControl(new NavigationControl(), "top-right");
map.addControl(new ScaleControl(), "bottom-left");

// Every file in src/features/ exports `default function (map: Map)`. It is loaded automatically;
// add a file, no need to edit this one.
// One broken feature never takes down the others.
const features = import.meta.glob<{ default: (map: Map) => void | Promise<void> }>("./features/*.ts", { eager: true });
map.on("load", () => {
  for (const [path, mod] of Object.entries(features)) {
    Promise.resolve()
      .then(() => mod.default(map))
      .catch((err) => console.error(`feature ${path} failed`, err));
  }
});
