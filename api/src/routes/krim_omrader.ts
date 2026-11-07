import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/krim_omrader?bbox=&q=&limit= -> reported crime per 1000 residents per area: Oslo bydeler (level 'bydel',
// Oslo kommune KRI002) and every municipality in Oslo + Akershus (level 'kommune', SSB 08487). Oslo has both a bydel
// row and a kommune row: filter on level. Properties: name, level, areaId, period, totalPer1000, violencePer1000,
// theftPer1000, drugsPer1000, the same with Norway / Oslo at the end, and counts for bydeler.
export default new Hono().get("/", (c) => layer(c, "krim_omrader"));
