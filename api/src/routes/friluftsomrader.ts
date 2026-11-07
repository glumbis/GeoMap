import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/friluftsomrader?bbox=&q=&limit= -> state-secured outdoor recreation areas in Oslo + Akershus.
// Properties: name, areaId, description, factSheet, source.
export default new Hono().get("/", (c) => layer(c, "friluftsomrader"));
