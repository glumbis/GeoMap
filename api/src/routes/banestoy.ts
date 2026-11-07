import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/banestoy?bbox=&q=&limit= -> Bane NOR railway noise zones (T-1442) in Oslo + Akershus.
// Properties: id, name, stoysone ('rød' = Lden >= 68 dB | 'gul' = Lden >= 58 dB), line (railway line), year, source.
// Red lies inside yellow: draw yellow first, then red on top. No metro or tram.
export default new Hono().get("/", (c) => layer(c, "banestoy"));
