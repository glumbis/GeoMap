import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/tjenester?bbox=&q=&limit= -> grocery stores, pharmacies and doctors' offices from OpenStreetMap, Oslo + Akershus.
// Points. Properties: id (OSM id, e.g. node/123), kind ('dagligvare' | 'apotek' | 'lege'), name, brand, source.
// Credit "© OpenStreetMap contributors" (ODbL).
export default new Hono().get("/", (c) => layer(c, "tjenester"));
