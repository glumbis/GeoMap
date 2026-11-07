// Radon susceptibility (radon aktsomhet, version 2, Sept 2026) for Oslo + Akershus, from NGU and DSA (NLOD, credit "NGU").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Source: NGU OGC API Features `radonaktsomhet`, GeoJSON in CRS84 (lng, lat), no key.
// Classes (radonAktsomhetGrad): lav, middels, høy, megetHøy, usikker ("uncertain": the map can't say).
// It is a susceptibility map, not a measurement: only an indoor measurement tells the real radon level of a home.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const ITEMS = "https://geo.ngu.no/api/features/radonaktsomhet/collections/radonaktsomhet/items";

const [box] = await query<{ minx: number; miny: number; maxx: number; maxy: number }>(`
  SELECT min(ST_XMin(geom)) AS minx, min(ST_YMin(geom)) AS miny, max(ST_XMax(geom)) AS maxx, max(ST_YMax(geom)) AS maxy
  FROM kommuner`);
if (box?.minx == null) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

// Follow the API's "next" links until every feature in the bbox is fetched.
const features: unknown[] = [];
let url: string | undefined = `${ITEMS}?f=json&limit=1000&bbox=${[box.minx, box.miny, box.maxx, box.maxy].join(",")}`;
while (url) {
  const page = await getJson(url);
  features.push(...page.features);
  url = page.links?.find((l: { rel: string; href: string }) => l.rel === "next")?.href;
}

const file = rawPath("radon.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

await conn.run(`
  CREATE OR REPLACE TABLE radon AS
  SELECT
    "identifikasjon.lokalId" AS id,
    CASE radonAktsomhetGrad WHEN 'lav' THEN 'Lav' WHEN 'middels' THEN 'Middels' WHEN 'høy' THEN 'Høy'
      WHEN 'megetHøy' THEN 'Meget høy' WHEN 'usikker' THEN 'Usikker' END AS name,
    radonAktsomhetGrad AS aktsomhet,
    radonUranDatametode AS method,
    oppdateringsdato::DATE AS updated,
    'NGU' AS source,
    -- Few, large, very detailed polygons: simplify to ~5 m (0.00005°). The map is modelled, so this loses nothing.
    ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00005)) AS geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ aktsomhet: string; n: number }>("SELECT aktsomhet, count(*)::INTEGER AS n FROM radon GROUP BY 1 ORDER BY 2 DESC");
console.log(`radon: ${counts.map((c) => `${c.aktsomhet}=${c.n}`).join(", ")} (${features.length} fetched in bbox)`);
