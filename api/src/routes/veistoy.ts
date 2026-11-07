import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/veistoy?bbox=&q=&limit= -> red and yellow road noise zones (T-1442) from Statens vegvesen.
// Table built by data/scripts/veistoy.ts (owner: Even). Only national and county roads.
export default new Hono().get("/", (c) => layer(c, "veistoy"));
