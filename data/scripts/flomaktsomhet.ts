// Flood awareness areas (aktsomhetsområder for flom) for Oslo + Akershus, from NVE (NLOD, credit "NVE").
// Owner: Sverre. Needs the `kommuner` table.
// Source: NVE ArcGIS REST `FlomAktsomhet`, layer 1 Flom_aktsomhetsomrade, GeoJSON in EPSG:4326 (no key).
// A national overview made from terrain models along all rivers and streams: areas that MAY flood and must be
// checked before building (TEK17 7-2). Coarser than the flood zones (`flomsoner`), but covers the places
// where NVE has no flood zone map, so "not mapped" can become a real answer.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const LAYER = "https://kart.nve.no/enterprise/rest/services/FlomAktsomhet/MapServer/1";

const bbox = await studyBbox();
const features = await arcgisFeatures(LAYER, bbox, { outFields: "objectid,vassomr,tematiskkvalitet,oppdateringsdato" });

const file = rawPath("flomaktsomhet.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per NVE polygon. Outlines simplified to ~1 m.
await conn.run(`
  CREATE OR REPLACE TABLE flomaktsomhet AS
  SELECT
    objectid::VARCHAR AS id,
    'Aktsomhetsområde for flom' AS name,
    vassomr AS riverArea,
    tematiskkvalitet AS quality,
    'NVE' AS source,
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00001)) AS geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [c] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM flomaktsomhet");
console.log(`flomaktsomhet: ${c.n} areas (${features.length} fetched in bbox)`);
