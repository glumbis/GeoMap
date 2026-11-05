import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { features } from "./features";

// Kartverket topo basemap (free, no API key).
const map = new maplibregl.Map({
  container: "map",
  center: [10.75, 59.91], // Oslo
  zoom: 10,
  style: {
    version: 8,
    sources: {
      topo: {
        type: "raster",
        tiles: ["https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"],
        tileSize: 256,
        attribution: "© Kartverket",
      },
    },
    layers: [{ id: "topo", type: "raster", source: "topo" }],
  },
});

map.addControl(new maplibregl.NavigationControl());
map.on("load", () => features.forEach((add) => add(map)));
