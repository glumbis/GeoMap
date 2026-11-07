import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/steinsprang?bbox=&q=&limit= -> NVE rockfall susceptibility areas in Oslo + Akershus.
// Properties: id, name, zone ('utløsning' = release area, 'utløp' = runout area), quality, source.
export default new Hono().get("/", (c) => layer(c, "steinsprang"));
