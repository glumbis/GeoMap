import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/stormflo?bbox=&q=&limit= -> land that floods in a storm surge (Kartverket), Oslo + Akershus.
// Properties: id, name, years (20 | 200), climate ('nå' = today | '2100' = with sea level rise), waterLevelCm (above NN2000), source.
// Scenarios overlap (20-year lies inside 200-year, today inside 2100): draw 2100 first, then 200, then 20 on top.
export default new Hono().get("/", (c) => layer(c, "stormflo"));
