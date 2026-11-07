import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/losmasser?bbox=&q=&limit= -> NGU soil type polygons (løsmasser lokalt) in Oslo + Akershus.
// Properties: id, name (soil type), losmassetype (NGU code), marineClay, scale, source.
// ~29k polygons: always pass a bbox.
export default new Hono().get("/", (c) => layer(c, "losmasser"));
