// Flood zones (flomsoner) for Oslo + Akershus, from NVE (NLOD, credit "NVE").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Source: NVE ArcGIS REST `Flomsoner2`, one layer per return period, fetched as GeoJSON in EPSG:4326 (no key).
// Zones are nested: the 10-year zone lies inside the 200-year zone, so an address can hit several rows.
// Use the lowest gjentaksintervall that hits (10 is worse than 200).
// Only mapped rivers: outside every zone can mean "not mapped", not "safe".
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const SERVICE = "https://kart.nve.no/enterprise/rest/services/Flomsoner2/MapServer";
// Current-climate zones only. 500/1000-year and the climate-adjusted layers are left out on purpose.
const LAYERS: [layer: number, years: number][] = [[13, 10], [14, 20], [15, 50], [16, 100], [17, 200]];
const FIELDS = "objectid,flomsoneid,gjentaksinterval,symbolflom,statusdato";
const PAGE = 1000;

const [box] = await query<{ minx: number; miny: number; maxx: number; maxy: number }>(`
  SELECT min(ST_XMin(geom)) AS minx, min(ST_YMin(geom)) AS miny, max(ST_XMax(geom)) AS maxx, max(ST_YMax(geom)) AS maxy
  FROM kommuner`);
if (box?.minx == null) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

// Flooded land only (objekttype FlomAreal), not the river, lake or sea itself. Current mappings only
// (statuskartlegging 1 = gjeldende, 5 = ajourført).
const features: any[] = [];
for (const [layer, years] of LAYERS) {
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where: "objekttype = 'FlomAreal' AND statuskartlegging IN (1, 5)",
      geometry: [box.minx, box.miny, box.maxx, box.maxy].join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: FIELDS,
      outSR: "4326",
      orderByFields: "objectid",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: "geojson",
    });
    const page = await getJson(`${SERVICE}/${layer}/query?${params}`);
    if (page.error) throw new Error(`NVE layer ${layer}: ${JSON.stringify(page.error)}`);
    // Tag each feature with the layer's return period (the field is missing on a few rows).
    for (const f of page.features) f.properties.years = years;
    features.push(...page.features);
    if (page.features.length < PAGE) break;
  }
}

const file = rawPath("flomsoner.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per NVE part, NOT merged per zone: merged zones get huge (one had 374k vertices), while the
// parts are small, so a bbox query only sends what is in view. An address can hit several parts; that's fine.
// Outlines are simplified to ~1 m (0.00001°), well inside the maps' accuracy, cutting vertices ~4x.
// lowPoint (symbolflom 2 = lavpunkt): land below the flood level without a direct link to the river.
// It can still flood (through drains, culverts or groundwater).
await conn.run(`
  CREATE OR REPLACE TABLE flomsoner AS
  WITH parts AS (
    SELECT *, coalesce(symbolflom = 2, false) AS lowPoint FROM ST_Read('${file}')
    WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  )
  SELECT
    years || '-' || objectid AS id, -- objectid is only unique within one NVE layer
    years || '-årsflom' || CASE WHEN lowPoint THEN ', lavpunkt' ELSE '' END || ' (' || flomsoneid || ')' AS name,
    flomsoneid AS flomsoneId,
    years::INTEGER AS gjentaksintervall,
    lowPoint,
    make_timestamp(statusdato::BIGINT * 1000)::DATE AS statusDate,
    'NVE' AS source,
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00001)) AS geom
  FROM parts
`);
const counts = await query<{ gjentaksintervall: number; n: number }>(
  "SELECT gjentaksintervall, count(*)::INTEGER AS n FROM flomsoner GROUP BY 1 ORDER BY 1",
);
console.log(`flomsoner: ${counts.map((c) => `${c.gjentaksintervall}y=${c.n}`).join(", ")} rows (${features.length} parts fetched)`);
