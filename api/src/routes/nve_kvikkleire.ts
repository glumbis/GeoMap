import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/nve_kvikkleire?bbox=&q=&limit= -> NVE quick clay hazard zones in Oslo + Akershus.
// Properties: id, name, faregrad (Lav/Middels/Høy), konsekvens, risikoklasse (0-5), kommune, reportUrl, source.
export default new Hono().get("/", (c) => layer(c, "nve_kvikkleire"));
