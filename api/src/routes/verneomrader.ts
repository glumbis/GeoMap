import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/verneomrader?bbox=&q=&limit= -> protected nature areas (Naturbase) in Oslo + Akershus.
// Properties: name, areaId, shortName, protectionType (e.g. naturreservat), protectedSince, factSheet, source.
export default new Hono().get("/", (c) => layer(c, "verneomrader"));
