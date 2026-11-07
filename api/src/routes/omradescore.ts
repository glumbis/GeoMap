import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/omradescore?bbox=&q=&limit= -> 500 m squares in Oslo + Akershus with the overall 0–100 score at their
// centre (data/scripts/zz_omradescore.ts, owner Erik). Properties: cid, score, capText, present, expected, living, building,
// family, commuter, hazard, quiet, noiseDb, schoolM, kindergartenM, groceryM, transitStopM, trailsM, doctorM, transitDepartures,
// name, place (grunnkrets), bydel (Oslo only), kommune, kommunenummer, source. All nullable (NULL = no data). Filtering by criteria: GET /api/finn (routes/finn.ts).
export default new Hono().get("/", (c) => layer(c, "omradescore"));
