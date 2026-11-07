import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/snoskred?bbox=&q=&limit= -> NVE snow avalanche susceptibility areas (NAKSIN, S2) in Oslo + Akershus.
// Properties: id, name, forestEffect (true = with today's forest, false = if the forest is gone), source.
export default new Hono().get("/", (c) => layer(c, "snoskred"));
