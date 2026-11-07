// Registered cultural heritage sites (kulturminner, layer "lokalitet") in Oslo + Akershus, from Riksantikvaren's
// "Kulturminner - Lokaliteter, Enkeltminner og Sikringssoner" on Geonorge (NLOD 2.0, keyless). Owner: Even.
// Source: the Oslo and Akershus county downloads (FGDB in a zip, UTM 33 = EPSG:25833), read straight from the zip.
// Needs the `kommuner` table. Matches the `culturalHeritage` data point in api/src/datapoints.ts (info only).
// Kept: sites with a protection status today. Dropped: removed (FJE), protection lifted (OPP, OPPV), no protection (IKKEV).
// vernetype codes: https://register.geonorge.no/sosi-kodelister/kulturminner/vernetype
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const COUNTIES = ["03_Oslo", "32_Akershus"];
const BASE = "https://nedlasting.geonorge.no/geonorge/Kulturminner/Kulturminner/FGDB";
const STATUS: Record<string, string> = {
  AUT: "automatisk fredet", VED: "vedtaksfredet", FOR: "forskriftsfredet", MID: "midlertidig fredet",
  FPG: "fredningssak pågår", WHS: "verdensarv", STAT: "statlig listeført", LIST: "listeført kirke",
  KOM: "kommunalt listeført", REG: "regionalt verneverdig", PBL: "vernet etter plan- og bygningsloven",
  FVERN: "vernet fartøy", SAM: "sammensatt vernestatus", UAV: "uavklart vernestatus",
};
// Fredet = protected by the Cultural Heritage Act (strongest). The others are listed or protected by a local plan.
const PROTECTED_BY_LAW = ["AUT", "VED", "FOR", "MID"];

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const reads: string[] = [];
for (const c of COUNTIES) {
  const name = `Kulturminner_${c}_25833_Kulturminner_FGDB`;
  const zip = await download(`${BASE}/${name}.zip`, `kulturminner_${c}.zip`);
  reads.push(`SELECT * FROM ST_Read('/vsizip/${zip}/${name}.gdb', layer := 'lokalitet')`);
}
const statusCase = `CASE vernetype ${Object.entries(STATUS).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(" ")} END`;

await conn.run(`
  CREATE OR REPLACE TABLE kulturminner AS
  WITH raw AS (${reads.join(" UNION ALL BY NAME ")}),
  s AS (
    SELECT DISTINCT ON (lokalid)
      lokalid AS siteId,
      nullif(trim(navn), '') AS siteName,
      vernetype AS statusCode,
      ${statusCase} AS status,
      vernetype IN (${PROTECTED_BY_LAW.map((k) => `'${k}'`).join(", ")}) AS fredet,
      CASE lokalitetskategori WHEN 'L-ARK' THEN 'arkeologisk' WHEN 'L-BVF' THEN 'bygning eller anlegg' WHEN 'L-KRK' THEN 'kirke' END AS kind,
      linkkulturminnesok AS link,
      ST_MakeValid(ST_Transform(SHAPE, 'EPSG:25833', 'EPSG:4326', always_xy := true)) AS geom
    FROM raw
    WHERE vernetype IS NOT NULL AND vernetype NOT IN ('FJE', 'OPP', 'OPPV', 'IKKEV', 'IKKE')
  )
  SELECT coalesce(siteName, 'Kulturminne ' || siteId) AS name, s.* EXCLUDE (geom), 'Riksantikvaren' AS source, s.geom
  FROM s
  WHERE ST_Intersects(s.geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ status: string; n: number }>(
  "SELECT coalesce(status, statusCode) AS status, count(*)::INTEGER AS n FROM kulturminner GROUP BY 1 ORDER BY 2 DESC",
);
console.log(`kulturminner: ${counts.map((c) => `${c.n} × ${c.status}`).join(", ")}`);
