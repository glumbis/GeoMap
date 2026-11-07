// Railway noise zones (støysoner for jernbane etter T-1442) for Oslo + Akershus, from Bane NOR's
// "Støysoner for Bane NORs jernbanenett" on Geonorge (open data, no conditions). Owner: Sverre. Needs the `kommuner` table.
// Source: county downloads for Oslo and Akershus (file geodatabase in a zip, UTM 33 = EPSG:25833), read straight from the zip.
// T-1442 for railways: red zone Lden >= 68 dB, yellow zone Lden >= 58 dB (or the night peak-level limits).
// Bane NOR's national railway only: no metro (T-bane) or tram, those are run by Sporveien and are not in this map.
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const BASE = "https://nedlasting.geonorge.no/geonorge/Forurensning/StoysonerJernbanenett/FGDB";
const FILES = [
  { county: "oslo", file: "Forurensning_03_Oslo_25833_StoysonerJernbanenett_FGDB" },
  { county: "akershus", file: "Forurensning_32_Akershus_25833_StoysonerJernbanenett_FGDB" },
];

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const parts: string[] = [];
for (const f of FILES) {
  const zip = await download(`${BASE}/${f.file}.zip`, `banestoy_${f.county}.zip`);
  parts.push(`
    SELECT '${f.county}-' || OBJECTID AS id,
      CASE stoysonekategori WHEN 'R' THEN 'rød' WHEN 'G' THEN 'gul' END AS stoysone,
      stoykildenavn AS line, beregnetar::INTEGER AS year,
      -- Outlines simplified to 1 m (in UTM metres), well inside a noise model's accuracy.
      ST_Transform(ST_SimplifyPreserveTopology(SHAPE, 1.0), 'EPSG:25833', 'EPSG:4326', always_xy := true) AS geom
    FROM ST_Read('/vsizip/${zip}/${f.file}.gdb', layer := 'stoysonerjernbanenett_stoy')
    WHERE stoysonekategori IN ('R', 'G')`);
}

await conn.run(`
  CREATE OR REPLACE TABLE banestoy AS
  SELECT id,
    CASE stoysone WHEN 'rød' THEN 'Rød' ELSE 'Gul' END || ' støysone fra jernbane' || coalesce(' (' || line || ')', '') AS name,
    stoysone, line, year, 'Bane NOR' AS source, ST_MakeValid(geom) AS geom
  FROM (${parts.join(" UNION ALL ")})
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ stoysone: string; n: number; lines: number; years: string }>(
  "SELECT stoysone, count(*)::INTEGER AS n, count(DISTINCT line)::INTEGER AS lines, min(year) || '-' || max(year) AS years FROM banestoy GROUP BY 1 ORDER BY 1 DESC",
);
console.log(`banestoy: ${counts.map((c) => `${c.n} ${c.stoysone} (${c.lines} lines, ${c.years})`).join(", ")}`);
