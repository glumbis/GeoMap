import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/energibronner?bbox=&q=&limit= -> NGU energy wells (points) in Oslo + Akershus.
// Properties: name, wellId, drilledM, depthToBedrockM, drillYear, use, factSheet, source. About 23 000 points: ask with a bbox.
export default new Hono().get("/", (c) => layer(c, "energibronner"));
