// Soil type at the surface (løsmasser lokalt, mostly 1:50 000) for Oslo + Akershus, from NGU (NLOD, credit "NGU").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Why "lokalt": NGU's "detaljert" and "regionalt" soil maps do not cover Oslo + Akershus; "lokalt" does.
// Source: NGU county downloads (GeoPackage in a zip, geographic EUREF89 = lng/lat), read straight from the zip.
// The Oslo and Akershus files overlap at the county border, so features are de-duplicated by NGU's lokalId.
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const BASE = "https://nedlasting.ngu.no/api/fileproxy/4d50a95c-e220-44c5-8bed-393c38fff6d4";
const FILES = [
  ["losmasser_oslo.zip", `${BASE}/fbf9e305-2eab-4ed2-b3eb-f8d3461d566c`],
  ["losmasser_akershus.zip", `${BASE}/d82097fe-475b-4d9e-8725-021c90bfbcd8`],
];

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const sources = [];
for (const [name, url] of FILES) {
  const zip = await download(url, name);
  // Files are EUREF89 lng/lat (EPSG:4258). It differs from WGS84 (EPSG:4326) by well under 1 m, so relabel it.
  sources.push(
    `SELECT * REPLACE (ST_SetCRS(geom, 'EPSG:4326') AS geom) FROM ST_Read('/vsizip/${zip}/LosmasseLokalt.gpkg', layer := 'LøsmasseFlate')`,
  );
}

// marineClay: thick, continuous marine (sea and fjord) deposits (type 40/41). This fine-grained clay is
// where quick clay can occur. Thin or beach deposits (42, 43) are not counted.
// Outlines simplified to ~1 m (0.00001°), well inside the 1:50 000 accuracy.
await conn.run(`
  CREATE OR REPLACE TABLE losmasser AS
  WITH parts AS (${sources.join(" UNION ALL BY NAME ")}),
  uniq AS (
    SELECT DISTINCT ON (lokalId) * FROM parts
    WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  )
  SELECT
    lokalId AS id,
    løsmassetypeNavn AS name,
    løsmassetype::INTEGER AS losmassetype,
    løsmassetype IN (40, 41) AS marineClay,
    egnetMålestokk::INTEGER AS scale,
    'NGU' AS source,
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00001)) AS geom
  FROM uniq
`);
const [s] = await query<{ n: number; clay: number; pts: number }>(
  "SELECT count(*)::INTEGER AS n, count(*) FILTER (WHERE marineClay)::INTEGER AS clay, sum(ST_NPoints(geom))::INTEGER AS pts FROM losmasser",
);
console.log(`losmasser: ${s.n} rows (${s.clay} marine clay), ${s.pts} vertices`);
