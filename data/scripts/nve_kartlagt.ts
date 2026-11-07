// Where NVE has mapped quick clay and flood (coverage), for Oslo + Akershus. NVE, NLOD, credit "NVE".
// Owner: Lukas (used by the profile to tell "not in a zone, area is mapped" from "not mapped at all").
// Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Sources (ArcGIS REST, GeoJSON in EPSG:4326, no key):
// - SkredKvikkleire2 layer 2 KvikkleireKartlagtOmrade: areas NVE has mapped for quick clay hazard zones.
// - Flomsoner2 layer 0 FlomsoneAnalyseomraade: areas the flood zone maps were computed for.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const NVE = "https://kart.nve.no/enterprise/rest/services";
const bbox = await studyBbox();

const LAYERS = [
  { table: "kvikkleire_kartlagt", url: `${NVE}/SkredKvikkleire2/MapServer/2`, nameField: "kartleggingsomradenavn" },
  { table: "flom_kartlagt", url: `${NVE}/Flomsoner2/MapServer/0`, nameField: "flomsonenavn" },
];

for (const { table, url, nameField } of LAYERS) {
  const features = await arcgisFeatures(url, bbox, { outFields: `objectid,${nameField}` });
  const file = rawPath(`${table}.geojson`);
  await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));
  await conn.run(`
    CREATE OR REPLACE TABLE ${table} AS
    SELECT objectid::INTEGER AS id, ${nameField} AS name, 'NVE' AS source, ST_MakeValid(geom) AS geom
    FROM ST_Read('${file}')
    WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  `);
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::INTEGER AS n FROM ${table}`);
  console.log(`${table}: ${n} mapped areas (${features.length} fetched in bbox)`);
}
