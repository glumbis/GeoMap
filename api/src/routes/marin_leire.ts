import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/marin_leire?bbox=&q=&limit= -> NGU possible marine clay (mulighet for marin leire) in Oslo + Akershus.
// Properties: id, class (NGU code), name (NGU text), level (5 = svært ofte .. 0 = stort sett aldri), soil, source.
// Only land below the marine limit has polygons.
export default new Hono().get("/", (c) => layer(c, "marin_leire"));
