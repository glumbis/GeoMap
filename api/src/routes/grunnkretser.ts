import { Hono } from "hono";
import { layer } from "../geojson.ts";

// GET /api/grunnkretser?bbox=&q=&limit= -> SSB grunnkretser (small statistical areas) in Oslo + Akershus with population.
// Properties: id (grunnkretsnummer), name, kommunenummer, year, population, under20, over70, areaKm2, perKm2,
// pctUnder20, pctOver70, source. Good for a population-density choropleth on perKm2.
export default new Hono().get("/", (c) => layer(c, "grunnkretser"));
