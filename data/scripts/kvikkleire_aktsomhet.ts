// Quick-clay slide awareness areas (aktsomhetsområder for kvikkleireskred) for Oslo + Akershus, from NVE
// (NLOD, credit "NVE"). Owner: Sverre. Needs the `kommuner` table.
// Source: NVE ArcGIS REST `KvikkleireskredAktsomhet`, GeoJSON in EPSG:4326 (no key). Two tables:
//   kvikkleire_aktsomhet          layer 0: areas where a quick-clay slide is possible (terrain + marine clay).
//   kvikkleire_aktsomhet_dekning  layer 1: map sheets NVE has assessed (the coverage), so "no area" can be told
//                                 apart from "not assessed".
// Much coarser than the quick-clay hazard zones (`nve_kvikkleire`), but it covers far more of Akershus.
// It says "possible, must be checked before building" (TEK17 7-3), not "will happen".
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const SERVICE = "https://kart.nve.no/enterprise/rest/services/KvikkleireskredAktsomhet/MapServer";
const bbox = await studyBbox();

const areas = await arcgisFeatures(`${SERVICE}/0`, bbox, { outFields: "objectid,oppdateringsdato" });
const areasFile = rawPath("kvikkleire_aktsomhet.geojson");
await writeFile(areasFile, JSON.stringify({ type: "FeatureCollection", features: areas }));
await conn.run(`
  CREATE OR REPLACE TABLE kvikkleire_aktsomhet AS
  SELECT objectid::VARCHAR AS id, 'Aktsomhetsområde for kvikkleireskred' AS name, 'NVE' AS source,
    -- Outlines simplified to ~2 m; the map itself is far coarser.
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00002)) AS geom
  FROM ST_Read('${areasFile}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);

const sheets = await arcgisFeatures(`${SERVICE}/1`, bbox, { outFields: "objectid,kartbladindeks,dekningstatus" });
const sheetsFile = rawPath("kvikkleire_aktsomhet_dekning.geojson");
await writeFile(sheetsFile, JSON.stringify({ type: "FeatureCollection", features: sheets }));
await conn.run(`
  CREATE OR REPLACE TABLE kvikkleire_aktsomhet_dekning AS
  SELECT objectid::INTEGER AS id, kartbladindeks AS name, dekningstatus AS status, 'NVE' AS source, ST_MakeValid(geom) AS geom
  FROM ST_Read('${sheetsFile}')
  WHERE dekningstatus ILIKE 'grundigKartlagt%' -- assessed (with or without finds); anything else counts as not assessed
    AND ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);

const [a] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kvikkleire_aktsomhet");
const statuses = sheets.map((f: any) => f.properties.dekningstatus);
const byStatus = Object.entries(statuses.reduce((m: Record<string, number>, s: string) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {}));
const [d] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kvikkleire_aktsomhet_dekning");
console.log(`kvikkleire_aktsomhet: ${a.n} areas (${areas.length} in bbox); dekning: ${d.n} assessed sheets kept (${byStatus.map(([s, n]) => `${s}=${n}`).join(", ")})`);
