import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/kulturminner?bbox=&q=&limit= -> Riksantikvaren cultural heritage sites in Oslo + Akershus.
// Properties: name, siteId, statusCode (AUT, VED, KOM, ...), status (bokmål), fredet (protected by law), kind, link, source.
export default new Hono().get("/", (c) => layer(c, "kulturminner"));
