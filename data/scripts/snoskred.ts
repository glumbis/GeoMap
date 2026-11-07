// Snow avalanche susceptibility areas (NAKSIN 2023, safety class S2 = homes) for Oslo + Akershus,
// from NVE (NLOD, credit "NVE"). Owner: Sverre. Needs the `kommuner` table.
// Source: NVE ArcGIS REST `SnoskredAktsomhet`, GeoJSON in EPSG:4326, no key. Two versions of the same map:
//   layer 3: with forest effect    (forestEffect = true):  where avalanches can reach with today's forest
//   layer 2: without forest effect (forestEffect = false): where they can reach if the forest is gone
// The forest version is the smaller zone and lies inside the other one.
// An overview map made from terrain models: it says "possible", not "will happen".
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const SERVICE = "https://kart.nve.no/enterprise/rest/services/SnoskredAktsomhet/MapServer";
const bbox = await studyBbox();
const where = "objektstatus = 1"; // gjeldende (current)
const features = [
  ...(await arcgisFeatures(`${SERVICE}/3`, bbox, { where, tag: { forestEffect: true } })),
  ...(await arcgisFeatures(`${SERVICE}/2`, bbox, { where, tag: { forestEffect: false } })),
];
const file = rawPath("snoskred.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per NVE polygon. Outlines simplified to ~2 m.
await conn.run(`
  CREATE OR REPLACE TABLE snoskred AS
  SELECT
    CASE WHEN forestEffect THEN 'skog-' ELSE 'utenskog-' END || objectid AS id, -- objectid is only unique per layer
    CASE WHEN forestEffect THEN 'Snøskred, aktsomhetsområde (med skog)'
         ELSE 'Snøskred, aktsomhetsområde (uten skog)' END AS name,
    forestEffect,
    'NVE' AS source,
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00002)) AS geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ forestEffect: boolean; n: number }>(
  "SELECT forestEffect, count(*)::INTEGER AS n FROM snoskred GROUP BY 1 ORDER BY 1 DESC",
);
console.log(`snoskred: ${counts.map((c) => `${c.forestEffect ? "with forest" : "without forest"}=${c.n}`).join(", ")} (${features.length} fetched in bbox)`);
