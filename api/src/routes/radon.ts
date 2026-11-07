import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/radon?bbox=&q=&limit= -> NGU radon susceptibility areas in Oslo + Akershus.
// Properties: id, name (Lav/Middels/Høy/Meget høy/Usikker), aktsomhet (NGU code), method, updated, source.
export default new Hono().get("/", (c) => layer(c, "radon"));
