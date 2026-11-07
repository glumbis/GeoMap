// Rockfall susceptibility areas (aktsomhetsområder for steinsprang) for Oslo + Akershus, from NVE (NLOD, credit "NVE").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Source: NVE ArcGIS REST `SkredSteinAktR`, GeoJSON in EPSG:4326 (no key). Two polygon layers:
//   1 Utløsningsområde: steep terrain where rock can break loose
//   2 Utløpsområde:     where falling rock can land
// (Layer 0 is a raster picture and is skipped.) An overview map made from terrain models,
// not a site survey: it says "possible", not "will happen".
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const SERVICE = "https://kart.nve.no/enterprise/rest/services/SkredSteinAktR/MapServer";
const LAYERS: [layer: number, zone: string][] = [[1, "utløsning"], [2, "utløp"]];

const bbox = await studyBbox();
const features: any[] = [];
for (const [layer, zone] of LAYERS) {
  features.push(...(await arcgisFeatures(`${SERVICE}/${layer}`, bbox, { outFields: "objectid,tematiskkvalitet", tag: { zone } })));
}

const file = rawPath("steinsprang.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per NVE polygon. zone: 'utløsning' (release) or 'utløp' (runout). Outlines simplified to ~2 m.
await conn.run(`
  CREATE OR REPLACE TABLE steinsprang AS
  SELECT
    zone || '-' || objectid AS id, -- objectid is only unique within one NVE layer
    CASE zone WHEN 'utløsning' THEN 'Steinsprang, utløsningsområde' ELSE 'Steinsprang, utløpsområde' END AS name,
    zone,
    tematiskkvalitet AS quality,
    'NVE' AS source,
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00002)) AS geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ zone: string; n: number }>("SELECT zone, count(*)::INTEGER AS n FROM steinsprang GROUP BY 1 ORDER BY 1");
console.log(`steinsprang: ${counts.map((c) => `${c.zone}=${c.n}`).join(", ")} (${features.length} fetched in bbox)`);
