// High-voltage overhead power lines (transmisjonsnett and regionalnett) in Oslo + Akershus, from NVE (NLOD, credit "NVE").
// Owner: Even. Needs the `kommuner` table.
// Source: NVE ArcGIS REST `Nettanlegg5` ("Nettanlegg utbygd"), layer 0 Transmisjonsnett_luftledning and
// 1 Regionalnett_luftledning, GeoJSON in EPSG:4326 (no key). The local distribution grid (up to 22 kV) is not in it.
// Matches the `powerLine` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const SERVICE = "https://kart.nve.no/enterprise/rest/services/Nettanlegg5/MapServer";
const LAYERS: [layer: number, level: string][] = [[0, "transmisjonsnett"], [1, "regionalnett"]];

const bbox = await studyBbox();
const features: any[] = [];
for (const [layer, level] of LAYERS) {
  features.push(...(await arcgisFeatures(`${SERVICE}/${layer}`, bbox, { outFields: "objectid,navn,spenning_kv,driftsattaar,drifter", tag: { level } })));
}

const file = rawPath("kraftlinjer.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per NVE line segment. voltageKv: 22–420 kV. name is NVE's line name (often "A - B").
await conn.run(`
  CREATE OR REPLACE TABLE kraftlinjer AS
  SELECT
    level || '-' || objectid AS id,
    coalesce(nullif(trim(navn), ''), 'Kraftlinje') AS name,
    level,
    spenning_kv::DOUBLE AS voltageKv,
    driftsattaar::INTEGER AS yearBuilt,
    drifter AS operator,
    'NVE' AS source,
    geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ level: string; n: number }>("SELECT level, count(*)::INTEGER AS n FROM kraftlinjer GROUP BY 1 ORDER BY 1");
console.log(`kraftlinjer: ${counts.map((c) => `${c.level}=${c.n}`).join(", ")} (${features.length} fetched in bbox)`);
