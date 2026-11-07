import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/grunnforurensning?bbox=&q=&limit= -> registered polluted-ground sites from Miljødirektoratet.
// Table built by data/scripts/grunnforurensning.ts (owner: Even).
export default new Hono().get("/", (c) => layer(c, "grunnforurensning"));
