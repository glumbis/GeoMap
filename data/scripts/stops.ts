// Public transport stops (all operators: bus, metro, tram, train, boat) in Oslo + Akershus,
// from Entur's Journey Planner API (NLOD, keyless). Owner: Even. Needs the `kommuner` table.
// One row per stop place (a station or a stop, possibly with several platforms/quays).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const [ext] = await query<{ minLng: number; minLat: number; maxLng: number; maxLat: number }>(`
  SELECT ST_XMin(g) AS minLng, ST_YMin(g) AS minLat, ST_XMax(g) AS maxLng, ST_YMax(g) AS maxLat
  FROM (SELECT ST_Extent_Agg(geom) AS g FROM kommuner)
`);
if (!ext?.minLng) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const gql = `{ stopPlacesByBbox(
  minimumLatitude: ${ext.minLat}, minimumLongitude: ${ext.minLng},
  maximumLatitude: ${ext.maxLat}, maximumLongitude: ${ext.maxLng}
) { id name latitude longitude transportMode quays { id } } }`;

const res = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "ET-Client-Name": "geomap-hackathon" },
  body: JSON.stringify({ query: gql }),
});
if (!res.ok) throw new Error(`Entur: ${res.status} ${await res.text()}`);
const js = await res.json();
if (js.errors) throw new Error(`Entur: ${JSON.stringify(js.errors)}`);

type Stop = { id: string; name: string; latitude: number; longitude: number; transportMode: string[]; quays: unknown[] };
const stops = (js.data.stopPlacesByBbox as Stop[]).map((s) => {
  const modes = [...new Set(s.transportMode ?? [])].sort();
  return {
    id: s.id,
    name: s.name,
    lng: s.longitude,
    lat: s.latitude,
    modes: modes.join(","), // e.g. "bus,rail"
    hasBus: modes.includes("bus"),
    hasTram: modes.includes("tram"),
    hasMetro: modes.includes("metro"),
    hasRail: modes.includes("rail"),
    hasWater: modes.includes("water"),
    quays: s.quays?.length ?? 0,
  };
});

const file = rawPath("stops.json");
await writeFile(file, JSON.stringify(stops));

await conn.run(`
  CREATE OR REPLACE TABLE stops AS
  WITH s AS (
    SELECT * EXCLUDE (lng, lat, quays), quays::INTEGER AS quays, ST_Point(lng, lat) AS geom
    FROM read_json_auto('${file}')
  )
  SELECT s.* EXCLUDE (geom), k.kommunenummer, 'Entur' AS source, s.geom
  FROM s JOIN kommuner k ON ST_Intersects(s.geom, k.geom)
`);
const [{ n }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM stops");
console.log(`stops: ${n} rows (of ${stops.length} in the bounding box)`);
