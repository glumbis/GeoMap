// Debris slide and debris flow susceptibility areas (aktsomhetsområder for jord- og flomskred) for Oslo + Akershus,
// from NVE (NLOD, credit "NVE"). Owner: Sverre. Needs the `kommuner` table.
// Source: NVE ArcGIS REST `JordFlomskredAktsomhet` layer 1 (runout areas), GeoJSON in EPSG:4326, no key.
// An overview map made from terrain models: it says "possible", not "will happen".
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const LAYER = "https://kart.nve.no/enterprise/rest/services/JordFlomskredAktsomhet/MapServer/1";

const features = await arcgisFeatures(LAYER, await studyBbox());
const file = rawPath("jordflomskred.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per NVE polygon. Outlines simplified to ~2 m.
await conn.run(`
  CREATE OR REPLACE TABLE jordflomskred AS
  SELECT
    objectid::INTEGER AS id,
    'Jord- og flomskred, aktsomhetsområde' AS name,
    'NVE' AS source,
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00002)) AS geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [{ n }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM jordflomskred");
console.log(`jordflomskred: ${n} rows (${features.length} fetched in bbox)`);
