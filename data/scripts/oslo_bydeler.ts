// Oslo's 15 bydeler + Sentrum + Marka as polygons with population, built from the `grunnkretser` table (Sverre)
// and SSB Klass's official grunnkrets -> bydel table (correspondence 2467: Bydelsinndeling 2020 - Grunnkretsinndeling 2025,
// CC BY 4.0, keyless). Owner: Even. Runs after grunnkretser.ts (scripts run in alphabetical order).
// Lets other data be shown per bydel instead of for all of Oslo (e.g. crime in ssb_krim.ts).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const KLASS = "https://data.ssb.no/api/klass/v1/correspondencetables/2467";

const [{ n }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM grunnkretser");
if (!n) throw new Error("grunnkretser table is empty. Run: npm run ingest grunnkretser");

const table = await getJson(KLASS);
const map = (table.correspondenceMaps as { sourceCode: string; sourceName: string; targetCode: string }[])
  .filter((m) => m.sourceCode.startsWith("0301") && m.targetCode.length === 8)
  .map((m) => ({ bydelId: m.sourceCode, bydel: m.sourceName, grunnkrets: m.targetCode }));
const file = rawPath("oslo_bydeler_grunnkretser.json");
await writeFile(file, JSON.stringify(map));

// grunnkretser.id lost its leading zero in the source file ("3011504"), so pad it back to 8 digits.
await conn.run(`
  CREATE OR REPLACE TABLE oslo_bydeler AS
  SELECT m.bydelId AS id, m.bydel AS name, '0301' AS kommunenummer,
    sum(g.population)::INTEGER AS population, max(g.year) AS year,
    'SSB/Kartverket' AS source, ST_MakeValid(ST_Union_Agg(g.geom)) AS geom
  FROM read_json_auto('${file}') m
  JOIN grunnkretser g ON lpad(g.id, 8, '0') = m.grunnkrets
  GROUP BY 1, 2
`);
const rows = await query<{ name: string; population: number }>("SELECT name, population FROM oslo_bydeler ORDER BY id");
const [miss] = await query<{ n: number }>(`
  SELECT count(*)::INTEGER AS n FROM grunnkretser g
  WHERE g.kommunenummer = '0301' AND lpad(g.id, 8, '0') NOT IN (SELECT grunnkrets FROM read_json_auto('${file}'))`);
console.log(`oslo_bydeler: ${rows.map((r) => `${r.name} ${r.population}`).join(", ")}. Oslo grunnkretser without bydel: ${miss.n}`);
