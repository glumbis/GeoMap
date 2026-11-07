// Registered polluted-ground sites (grunnforurensning) in Oslo + Akershus, from Miljødirektoratet's
// ArcGIS service (NLOD 2.0, credit Miljødirektoratet, keyless). Owner: Even. Needs the `kommuner` table.
// Matches the `pollutedGround` data point in api/src/datapoints.ts (nearest within 100 m).
// impact (påvirkningsgrad): '1' little or no pollution, '2' acceptable with today's use,
// '3' not acceptable, action needed, 'X' suspected / too little information.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const LAYER = "https://kart.miljodirektoratet.no/arcgis/rest/services/grunnforurensning2/MapServer/1/query";
const PAGE = 2000;

const [ext] = await query<{ minLng: number; minLat: number; maxLng: number; maxLat: number }>(`
  SELECT ST_XMin(g) AS minLng, ST_YMin(g) AS minLat, ST_XMax(g) AS maxLng, ST_YMax(g) AS maxLat
  FROM (SELECT ST_Extent_Agg(geom) AS g FROM kommuner)
`);
if (!ext?.minLng) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const features: any[] = [];
for (let offset = 0; ; offset += PAGE) {
  const params = new URLSearchParams({
    where: "1=1", outFields: "*", f: "geojson", outSR: "4326", inSR: "4326",
    geometry: `${ext.minLng},${ext.minLat},${ext.maxLng},${ext.maxLat}`,
    geometryType: "esriGeometryEnvelope", spatialRel: "esriSpatialRelIntersects",
    orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: String(PAGE),
  });
  const page = await getJson(`${LAYER}?${params}`);
  if (page.error) throw new Error(`Miljødirektoratet: ${JSON.stringify(page.error)}`);
  features.push(...page.features);
  if (page.features.length < PAGE) break;
}

const sites = features
  .filter((f) => f.geometry)
  .map((f) => {
    const p = f.properties;
    const grade = String(p.Pavirkningsgrad ?? "");
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        siteId: p.Lokalitet_ID != null ? String(p.Lokalitet_ID) : null,
        name: p.Lokalitetnavn || null,
        siteType: p.Lokalitettype || null, // e.g. Forurenset grunn, Deponi, Skytebaner
        status: p.Prosesstatus || null, // e.g. Uavklart, Tiltak gjennomført, Avsluttet
        impact: grade ? grade.split(" ")[0] : null, // '1' | '2' | '3' | 'X'
        impactText: grade ? grade.replace(/^\S+\s*-\s*/, "") : null,
        healthClass: p.HelsebasertTilstandsklasse || null,
        factSheet: p.Faktaark || null,
      },
    };
  });

const file = rawPath("grunnforurensning.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features: sites }));

await conn.run(`
  CREATE OR REPLACE TABLE grunnforurensning AS
  WITH s AS (
    SELECT siteId, name, siteType, status, impact, impactText, healthClass, factSheet, ST_MakeValid(geom) AS geom
    FROM ST_Read('${file}')
  )
  SELECT s.* EXCLUDE (geom), k.kommunenummer, 'Miljødirektoratet' AS source, s.geom
  FROM s JOIN kommuner k ON ST_Intersects(ST_PointOnSurface(s.geom), k.geom)
`);
const counts = await query<{ impact: string; n: number }>(
  "SELECT coalesce(impact, '?') AS impact, count(*)::INTEGER AS n FROM grunnforurensning GROUP BY 1 ORDER BY 1",
);
console.log(`grunnforurensning: ${counts.map((c) => `${c.n}×${c.impact}`).join(", ")} (of ${features.length} fetched)`);
