import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/krim_kommuner?bbox=&q=&limit= -> reported crime per 1000 residents per municipality (SSB 08487), Oslo + Akershus.
// Properties: name, kommunenummer, period ("2024–2025"), totalPer1000, violencePer1000, theftPer1000, drugsPer1000,
// and the same with "Norway" at the end for the whole country. Oslo is one municipality (no bydel numbers).
export default new Hono().get("/", (c) => layer(c, "krim_kommuner"));
