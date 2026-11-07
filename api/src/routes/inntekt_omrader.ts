import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/inntekt_omrader?bbox=&q=&limit= -> median household income after tax (SSB 06944) per area in Oslo + Akershus.
// Properties: name, level ('delomrade' | 'bydel' | 'kommune': areas overlap, so filter on level), areaId, kommunenummer,
// year, medianAfterTax (kr), households, source.
export default new Hono().get("/", (c) => layer(c, "inntekt_omrader"));
