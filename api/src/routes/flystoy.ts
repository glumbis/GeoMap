import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/flystoy?bbox=&q=&limit= -> Avinor aircraft noise zones (T-1442) in Oslo + Akershus, today only Gardermoen.
// Properties: id, name, stoysone ('rød' = Lden >= 62 dB | 'gul' = Lden >= 52 dB), airportCode (ENGM), airport, year, source.
// The red zone lies inside the yellow one: draw yellow first, then red on top.
export default new Hono().get("/", (c) => layer(c, "flystoy"));
