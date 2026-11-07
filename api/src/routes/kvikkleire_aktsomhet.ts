import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/kvikkleire_aktsomhet?bbox=&q=&limit= -> NVE quick-clay slide awareness areas in Oslo + Akershus.
// Properties: id, name, source. Coarse areas where a quick-clay slide is possible; draw under the hazard zones.
export default new Hono().get("/", (c) => layer(c, "kvikkleire_aktsomhet"));
