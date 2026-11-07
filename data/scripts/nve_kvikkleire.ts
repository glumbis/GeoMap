// Quick clay hazard zones (kvikkleire faresoner) for Oslo + Akershus, from NVE (NLOD, credit "NVE").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Source: NVE ArcGIS REST `SkredKvikkleire2` layer 0, fetched as GeoJSON in EPSG:4326 (no key).
// Only mapped zones: an address outside every zone may simply be unmapped, not safe.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const LAYER = "https://kart.nve.no/enterprise/rest/services/SkredKvikkleire2/MapServer/0";

// Every current zone (statusskredomr = 1) inside the study-area bbox.
const features = await arcgisFeatures(LAYER, await studyBbox(), {
  where: "statusskredomr = 1",
  outFields: "objectid,skredomrid,skredomrnavn,faregrad,konsekvens,risiko,kommune,rapporturl",
});

const file = rawPath("nve_kvikkleire.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per zone: NVE splits some zones into several polygons, and some parts lack a name,
// so parts are merged by zone id and the non-NULL value is kept (max() skips NULLs).
// faregrad: Lav / Middels / Høy (or Ingen). risikoklasse: 0-5 (5 = highest). Unknown values stay NULL.
await conn.run(`
  CREATE OR REPLACE TABLE nve_kvikkleire AS
  WITH parts AS (
    SELECT * FROM ST_Read('${file}')
    WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  )
  SELECT
    skredomrid::INTEGER AS id,
    max(skredomrnavn) AS name,
    -- worst hazard level if parts ever disagree
    arg_max(faregrad, CASE faregrad WHEN 'Høy' THEN 3 WHEN 'Middels' THEN 2 WHEN 'Lav' THEN 1 WHEN 'Ingen' THEN 0 END) AS faregrad,
    CASE max(konsekvens)::INTEGER WHEN 0 THEN 'Ingen' WHEN 1 THEN 'Mindre alvorlig' WHEN 2 THEN 'Alvorlig'
      WHEN 3 THEN 'Meget alvorlig' END AS konsekvens,
    max(risiko)::INTEGER AS risikoklasse,
    max(kommune) AS kommune,
    max(CASE WHEN rapporturl IS NULL OR trim(rapporturl) = '' THEN NULL
             WHEN rapporturl ILIKE 'http%' THEN rapporturl ELSE 'https://' || rapporturl END) AS reportUrl,
    'NVE' AS source,
    ST_MakeValid(ST_Union_Agg(geom)) AS geom
  FROM parts
  GROUP BY skredomrid
`);
const [{ n }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM nve_kvikkleire");
console.log(`nve_kvikkleire: ${n} rows (${features.length} fetched in bbox)`);
