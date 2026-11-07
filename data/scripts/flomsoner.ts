// Flood zones (flomsoner) for Oslo + Akershus, from NVE (NLOD, credit "NVE").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Source: NVE ArcGIS REST `Flomsoner2`, one layer per return period, fetched as GeoJSON in EPSG:4326 (no key).
// Zones are nested: the 10-year zone lies inside the 200-year zone, so an address can hit several rows.
// Use the lowest gjentaksintervall that hits (10 is worse than 200).
// Only mapped rivers: outside every zone can mean "not mapped", not "safe".
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const SERVICE = "https://kart.nve.no/enterprise/rest/services/Flomsoner2/MapServer";
// Current-climate zones only. 500/1000-year and the climate-adjusted layers are left out on purpose.
const LAYERS: [layer: number, years: number][] = [[13, 10], [14, 20], [15, 50], [16, 100], [17, 200]];

// Flooded land only (objekttype FlomAreal), not the river, lake or sea itself. Current mappings only
// (statuskartlegging 1 = gjeldende, 5 = ajourført). Each feature is tagged with its layer's return period.
const bbox = await studyBbox();
const features: any[] = [];
for (const [layer, years] of LAYERS) {
  features.push(
    ...(await arcgisFeatures(`${SERVICE}/${layer}`, bbox, {
      where: "objekttype = 'FlomAreal' AND statuskartlegging IN (1, 5)",
      outFields: "objectid,flomsoneid,gjentaksinterval,symbolflom,statusdato",
      tag: { years },
    })),
  );
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
