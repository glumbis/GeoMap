import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/stops?bbox=&q=&limit= -> public transport stops (bus, metro, tram, rail, water) from Entur.
// Table built by data/scripts/stops.ts (owner: Even).
export default new Hono().get("/", (c) => layer(c, "stops"));
