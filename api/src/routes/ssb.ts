import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/ssb?bbox=&q=&limit= -> SSB municipal stats (population, age, income, housing, education)
// as municipality polygons. Table built by data/scripts/ssb.ts (owner: Even).
export default new Hono().get("/", (c) => layer(c, "ssb_kommuner"));
