// Hiking trails, ski tracks, bike routes and other outdoor routes (Turrutebasen) in Oslo + Akershus,
// from Kartverket's county downloads (CC BY 4.0, keyless). Owner: Even. Needs the `kommuner` table.
// Matches the `trails` data point in api/src/datapoints.ts (nearest within 3 km).
// Each county is a zipped File Geodatabase in EPSG:25833; DuckDB reads it straight from the zip.
// One row per route line. Names come from the *info_tabell tables (one line can be part of several routes).
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const BASE = "https://nedlasting.geonorge.no/geonorge/Friluftsliv/TurOgFriluftsruter/FGDB";
const COUNTIES = ["03_Oslo", "32_Akershus"];
// line layer, info table, foreign key in the info table, route type stored in `routeType`
const TYPES = [
  ["fotrute_senterlinje", "fotruteinfo_tabell", "fotrute_fk", "fotrute"],
  ["skiloype_senterlinje", "skiloypeinfo_tabell", "skiloype_fk", "skiløype"],
  ["sykkelrute_senterlinje", "sykkelruteinfo_tabell", "sykkelrute_fk", "sykkelrute"],
  ["annenrute_senterlinje", "annenruteinfo_tabell", "annenrute_fk", "annen rute"],
] as const;
const LABEL: Record<string, string> = { fotrute: "Tursti", "skiløype": "Skiløype", sykkelrute: "Sykkelrute", "annen rute": "Turrute" };

const parts: string[] = [];
for (const county of COUNTIES) {
  const name = `Friluftsliv_${county}_25833_TurOgFriluftsruter_FGDB`;
  const zip = await download(`${BASE}/${name}.zip`, `turruter_${county}.zip`);
  const gdb = `/vsizip/${zip}/${name}.gdb`;
  for (const [lines, info, fk, type] of TYPES) {
    parts.push(`
      SELECT any_value(l.lokalid) AS id, '${type}' AS routeType,
             nullif(string_agg(DISTINCT i.rutenavn, ', ') FILTER (WHERE i.rutenavn NOT IN ('', 'Ukjent')), '') AS routeNames, -- 'Ukjent' = no name
             any_value(l.belysning) = 'JA' AS lit,
             any_value(l.SHAPE) AS geom25833
      FROM ST_Read('${gdb}', layer = '${lines}') l
      LEFT JOIN ST_Read('${gdb}', layer = '${info}') i ON i.${fk} = l.lokalid
      GROUP BY l.OBJECTID`);
  }
}

await conn.run(`
  CREATE OR REPLACE TABLE turruter AS
  WITH r AS (
    SELECT id, routeType, routeNames, coalesce(lit, false) AS lit,
           ST_Transform(geom25833, 'EPSG:25833', 'EPSG:4326', always_xy := true) AS geom
    FROM (${parts.join(" UNION ALL ")})
    WHERE geom25833 IS NOT NULL
  )
  SELECT r.id, r.routeType,
         coalesce(r.routeNames, CASE r.routeType ${Object.entries(LABEL).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(" ")} END) AS name,
         r.lit, k.kommunenummer, 'Kartverket' AS source, r.geom
  FROM r JOIN kommuner k ON ST_Intersects(ST_PointOnSurface(r.geom), k.geom)
`);
const counts = await query<{ routeType: string; n: number }>(
  "SELECT routeType, count(*)::INTEGER AS n FROM turruter GROUP BY 1 ORDER BY 2 DESC",
);
console.log(`turruter: ${counts.map((c) => `${c.n} ${c.routeType}`).join(", ")}`);
