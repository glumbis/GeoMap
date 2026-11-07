import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/kindergartens?bbox=&q=&limit= -> active barnehager from Udir (NBR).
// Table built by data/scripts/kindergartens.ts (owner: Even).
export default new Hono().get("/", (c) => layer(c, "kindergartens"));
