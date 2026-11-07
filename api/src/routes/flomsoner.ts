import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/flomsoner?bbox=&q=&limit= -> NVE flood zones (10, 20, 50, 100, 200-year) in Oslo + Akershus.
// Properties: id, name, flomsoneId, gjentaksintervall (years), lowPoint, statusDate, source.
// Zones are nested: draw the larger return periods first so the 10-year zone ends up on top.
export default new Hono().get("/", (c) => layer(c, "flomsoner"));
