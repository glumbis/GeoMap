import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/flomaktsomhet?bbox=&q=&limit= -> NVE flood awareness areas (aktsomhetsområder for flom) in Oslo + Akershus.
// Properties: id, name, riverArea (vassomr), quality, source. Many small polygons along rivers: fetch by bbox.
export default new Hono().get("/", (c) => layer(c, "flomaktsomhet"));
