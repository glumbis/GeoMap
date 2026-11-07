import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/kommuner?bbox=&q=&limit= -> municipality boundaries for Oslo + Akershus.
// Template for a dataset route: copy this file and change the table name.
export default new Hono().get("/", (c) => layer(c, "kommuner"));
