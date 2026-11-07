// Grunnkretser (SSB's small statistical areas, a few hundred people each) with population for Oslo + Akershus,
// from Kartverket/SSB "Befolkning på grunnkretsnivå" (open data, no conditions). Owner: Sverre. Needs the `kommuner` table.
// Source: Geonorge county downloads (file geodatabase in a zip, UTM 33 = EPSG:25833), read straight from the zip.
// Numbers are from 1 January (statistikkar). SSB hides age groups of 1–2 people (NULL in the file), so the age
// sums below can be a few people short of the total; shares are rounded to whole percent.
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const BASE = "https://nedlasting.geonorge.no/geonorge/Befolkning/BefolkningPaGrunnkretsniva2025/FGDB";
const FILES = [
  { county: "oslo", file: "Befolkning_03_Oslo_25833_BefolkningPaGrunnkretsniva2025_FGDB" },
  { county: "akershus", file: "Befolkning_32_Akershus_25833_BefolkningPaGrunnkretsniva2025_FGDB" },
];
const sum = (cols: string[]) => cols.map((c) => `coalesce(${c}, 0)`).join(" + ");
const UNDER_20 = sum(["befolkning0til04ar", "befolkning05til09ar", "befolkning10til14ar", "befolkning15til19ar"]);
const OVER_70 = sum(["befolkning70til74ar", "befolkning75til79ar", "befolkning80til84ar", "befolkning85til89ar", "befolkning90arogover"]);

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const parts: string[] = [];
for (const f of FILES) {
  const zip = await download(`${BASE}/${f.file}.zip`, `grunnkretser_${f.county}.zip`);
  parts.push(`
    -- The file stores the number as a number, so Oslo's leading zero is lost (3016005): pad back to 8 digits
    -- so it matches Kartverket's address file and SSB (03016005).
    SELECT lpad(CAST(grunnkretsnummer AS VARCHAR), 8, '0') AS id, grunnkretsnavn AS name, kommunenummer, statistikkar::INTEGER AS year,
      totalbefolkning::INTEGER AS population, (${UNDER_20})::INTEGER AS under20, (${OVER_70})::INTEGER AS over70,
      ST_Area(SHAPE) / 1e6 AS areaKm2,
      ST_Transform(ST_SimplifyPreserveTopology(SHAPE, 1.0), 'EPSG:25833', 'EPSG:4326', always_xy := true) AS geom
    FROM ST_Read('/vsizip/${zip}/${f.file}.gdb', layer := 'befolkningpagrunnkrets')`);
}

await conn.run(`
  CREATE OR REPLACE TABLE grunnkretser AS
  SELECT id, name, kommunenummer, year, population, under20, over70,
    round(areaKm2, 3) AS areaKm2,
    CASE WHEN areaKm2 > 0 THEN round(population / areaKm2)::INTEGER END AS perKm2,
    CASE WHEN population > 0 THEN round(100.0 * under20 / population)::INTEGER END AS pctUnder20,
    CASE WHEN population > 0 THEN round(100.0 * over70 / population)::INTEGER END AS pctOver70,
    'Kartverket/SSB' AS source, ST_MakeValid(geom) AS geom
  FROM (${parts.join(" UNION ALL ")})
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [s] = await query<{ n: number; people: number; year: number }>(
  "SELECT count(*)::INTEGER AS n, sum(population)::INTEGER AS people, max(year) AS year FROM grunnkretser",
);
console.log(`grunnkretser: ${s.n} grunnkretser, ${s.people.toLocaleString("en")} people (${s.year})`);
