import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/stoy_strategisk?bbox=&q=&limit= -> strategic road noise map (Lden, 5 dB bands, 2021) from Statens vegvesen.
// Table built by data/scripts/stoy_strategisk.ts (owner: Even). Large layer: always pass a bbox.
export default new Hono().get("/", (c) => layer(c, "stoy_strategisk"));
