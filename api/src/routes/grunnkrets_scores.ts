import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/grunnkrets_scores?bbox=&q=&limit= -> area scores per grunnkrets (built by `npm run scores`, data/area-scores.ts).
// Polygons. Properties: id (grunnkretsnummer), name, kommunenummer, addresses (rated street addresses), medianScore,
// p25, p75, pctHighWarning, pctSeriousWarning (high or medium), median_living, median_building, median_family,
// median_commuter, source. Only grunnkretser with at least 5 rated addresses. Good for a choropleth on medianScore.
export default new Hono().get("/", (c) => layer(c, "grunnkrets_scores"));
