// Aircraft noise zones (støysoner for lufthavn etter T-1442) for Oslo + Akershus, from Avinor's
// "Støysoner Avinors lufthavner" on Geonorge (open data, no conditions). Owner: Sverre. Needs the `kommuner` table.
// Source: the Akershus county download (GeoPackage in a zip, UTM 33 = EPSG:25833), read straight from the zip.
// Oslo has no Avinor airport, so Akershus is all of it: today only Oslo lufthavn Gardermoen (ENGM).
// T-1442/2021 for airports: red zone Lden >= 62 dB, yellow zone Lden >= 52 dB (or the night peak-level limits).
// Avinor maps every airport it runs, so outside these zones there is no Avinor aircraft noise zone.
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const FILE = "Forurensning_32_Akershus_25833_Flystoydata_GPKG";
const URL = `https://nedlasting.geonorge.no/geonorge/Forurensning/Flystoydata/GPKG/${FILE}.zip`;
const AIRPORTS: Record<string, string> = { ENGM: "Oslo lufthavn Gardermoen" };

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const zip = await download(URL, "flystoy_akershus.zip");
const gpkg = `/vsizip/${zip}/${FILE}.gpkg`;
const airportName = `CASE støykildenavn ${Object.entries(AIRPORTS).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(" ")} ELSE støykildenavn END`;

await conn.run(`
  CREATE OR REPLACE TABLE flystoy AS
  WITH z AS (
    SELECT
      identifikasjon_lokalId AS id,
      CASE støysonekategori WHEN 'R' THEN 'rød' WHEN 'G' THEN 'gul' END AS stoysone,
      støykildenavn AS airportCode,
      ${airportName} AS airport,
      beregnetÅr::INTEGER AS year,
      -- Outlines simplified to 1 m (in UTM metres), well inside a noise model's accuracy.
      ST_MakeValid(ST_Transform(ST_SimplifyPreserveTopology(område, 1.0), 'EPSG:25833', 'EPSG:4326', always_xy := true)) AS geom
    FROM ST_Read('${gpkg}', layer := 'Støy')
    WHERE støysonekategori IN ('R', 'G')
  )
  SELECT id,
    CASE stoysone WHEN 'rød' THEN 'Rød' ELSE 'Gul' END || ' flystøysone (' || airport || ')' AS name,
    stoysone, airportCode, airport, year, 'Avinor' AS source, geom
  FROM z
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ name: string; n: number; year: number }>(
  "SELECT name, count(*)::INTEGER AS n, max(year) AS year FROM flystoy GROUP BY 1 ORDER BY 1",
);
console.log(`flystoy: ${counts.map((c) => `${c.n} × ${c.name} (${c.year})`).join(", ")}`);
