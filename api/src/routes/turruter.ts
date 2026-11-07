import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/turruter?bbox=&q=&limit= -> hiking trails, ski tracks, bike routes (Turrutebasen, Kartverket).
// Table built by data/scripts/turruter.ts (owner: Even). Large layer: always pass a bbox.
export default new Hono().get("/", (c) => layer(c, "turruter"));
