// Rockfall susceptibility areas (aktsomhetsområder for steinsprang) for Oslo + Akershus, from NVE (NLOD, credit "NVE").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Source: NVE ArcGIS REST `SkredSteinAktR`, GeoJSON in EPSG:4326 (no key). Two polygon layers:
//   1 Utløsningsområde: steep terrain where rock can break loose
//   2 Utløpsområde:     where falling rock can land
// (Layer 0 is a raster picture and is skipped.) An overview map made from terrain models,
// not a site survey: it says "possible", not "will happen".
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const SERVICE = "https://kart.nve.no/enterprise/rest/services/SkredSteinAktR/MapServer";
const LAYERS: [layer: number, zone: string][] = [[1, "utløsning"], [2, "utløp"]];
const PAGE = 1000;

const [box] = await query<{ minx: number; miny: number; maxx: number; maxy: number }>(`
  SELECT min(ST_XMin(geom)) AS minx, min(ST_YMin(geom)) AS miny, max(ST_XMax(geom)) AS maxx, max(ST_YMax(geom)) AS maxy
  FROM kommuner`);
if (box?.minx == null) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const features: any[] = [];
for (const [layer, zone] of LAYERS) {
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: [box.minx, box.miny, box.maxx, box.maxy].join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "objectid,tematiskkvalitet",
      outSR: "4326",
      orderByFields: "objectid",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: "geojson",
    });
    const page = await getJson(`${SERVICE}/${layer}/query?${params}`);
    if (page.error) throw new Error(`NVE layer ${layer}: ${JSON.stringify(page.error)}`);
    for (const f of page.features) f.properties.zone = zone;
    features.push(...page.features);
    if (page.features.length < PAGE) break;
  }
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
