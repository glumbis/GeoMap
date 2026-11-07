import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/schools?bbox=&q=&limit= -> active grunnskoler and videregående skoler from Udir (NSR).
// Table built by data/scripts/schools.ts (owner: Even).
export default new Hono().get("/", (c) => layer(c, "schools"));
