// Storm surge (stormflo) along the Oslofjord for Oslo + Akershus, from Kartverket "Stormflo og havnivå"
// (CC BY 4.0, credit "© Kartverket"). Owner: Sverre. Needs the `kommuner` table.
// Source: Geonorge county downloads (file geodatabase in a zip, UTM 33 = EPSG:25833), read straight from the zip.
// Levels follow DSB's guidance (2024). Ordinary homes are safety class F2 = the 200-year storm surge.
// Three scenarios are loaded:
//   20-year storm surge today, 200-year storm surge today, 200-year storm surge in 2100 (with sea level rise).
// Kartverket's polygons include the sea itself. Today's sea (mean high water now) is cut away, so each row is
// only the LAND that floods. waterLevelCm is the water level in cm above NN2000 (the height system on maps).
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const BASE = "https://nedlasting.geonorge.no/geonorge/Samfunnssikkerhet/StormfloHavniva/FGDB";
const FILES = [
  { county: "oslo", file: "Samfunnssikkerhet_03_Oslo_25833_StormfloHavniva_FGDB" },
  { county: "akershus", file: "Samfunnssikkerhet_32_Akershus_25833_StormfloHavniva_FGDB" },
];
const SCENARIOS = [
  { layer: "stormflo_havniva_stormflo20ar_klimaarna", years: 20, climate: "nå" },
  { layer: "stormflo_havniva_stormflo200ar_klimaarna", years: 200, climate: "nå" },
  { layer: "stormflo_havniva_stormflo200ar_klimaar2100", years: 200, climate: "2100" },
];
const SEA = "stormflo_havniva_middelhoyvann_klimaarna"; // today's sea at mean high water

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const parts: string[] = [];
for (const f of FILES) {
  const zip = await download(`${BASE}/${f.file}.zip`, `stormflo_${f.county}.zip`);
  const gdb = `/vsizip/${zip}/${f.file}.gdb`;
  // Outlines are simplified to 1 m (in UTM metres) BEFORE the cut: same result, ~4x faster.
  // Today's sea as one shape, built once per county.
  await conn.run(`CREATE OR REPLACE TEMP TABLE sea_${f.county} AS
    SELECT ST_Union_Agg(ST_SimplifyPreserveTopology(SHAPE, 1.0)) AS g FROM ST_Read('${gdb}', layer := '${SEA}')`);
  for (const s of SCENARIOS) {
    parts.push(`
      SELECT '${f.county}-${s.years}-${s.climate}-' || OBJECTID AS id, ${s.years} AS years, '${s.climate}' AS climate,
        vannstandovernn2000::INTEGER AS waterLevelCm,
        ST_Transform(ST_Difference(ST_SimplifyPreserveTopology(SHAPE, 1.0), sea.g), 'EPSG:4326', always_xy := true) AS geom
      FROM ST_Read('${gdb}', layer := '${s.layer}') CROSS JOIN sea_${f.county} sea`);
  }
}

await conn.run(`
  CREATE OR REPLACE TABLE stormflo AS
  SELECT
    id,
    years || '-årsstormflo' || CASE WHEN climate = '2100' THEN ' i år 2100' ELSE ' i dag' END AS name,
    years::INTEGER AS years,
    climate,
    waterLevelCm,
    'Kartverket' AS source,
    ST_MakeValid(geom) AS geom
  FROM (${parts.join(" UNION ALL ")})
  WHERE NOT ST_IsEmpty(geom)
    AND ST_Area(geom) > 2e-9 -- drop slivers left over from the cut (< ~10 m²)
    AND ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const stats = await query<{ name: string; n: number; level: string }>(
  "SELECT name, count(*)::INTEGER AS n, min(waterLevelCm) || '-' || max(waterLevelCm) || ' cm' AS level FROM stormflo GROUP BY 1 ORDER BY 1",
);
console.log(`stormflo: ${stats.map((s) => `${s.name}=${s.n} (${s.level})`).join(", ")}`);
