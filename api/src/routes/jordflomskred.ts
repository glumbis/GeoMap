import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/jordflomskred?bbox=&q=&limit= -> NVE debris slide/flow susceptibility areas in Oslo + Akershus.
// Properties: id, name, source. ~10k polygons: always pass a bbox.
export default new Hono().get("/", (c) => layer(c, "jordflomskred"));
