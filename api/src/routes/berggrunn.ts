import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/berggrunn?bbox=&q=&limit= -> NGU bedrock (N50) polygons in Oslo + Akershus.
// Properties: id, name (rock type), rockCode, legend (NGU's full description), alumShale, color (NGU map colour), source.
export default new Hono().get("/", (c) => layer(c, "berggrunn"));
