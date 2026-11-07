// Possible marine clay (mulighet for marin leire) for Oslo + Akershus, from NGU (NLOD, credit "NGU").
// Owner: Sverre. Needs the `kommuner` table.
// Source: NGU county downloads (file geodatabase in a zip, UTM 33 = EPSG:25833), read straight from the zip.
// Quick clay forms in marine clay, so this shows where quick clay is POSSIBLE, also where NVE has made no
// quick-clay hazard map. Only land below the marine limit (the highest old sea level) is classified;
// above it there is no marine clay, and the map has no polygon.
// Classes (muligMarinLeire), from most to least likely:
//   sværtStor, sværtStorMenUsammenhengendeEllerTynt, stor, middels, liten, stortSettFraværende (ikkeAngitt is dropped).
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const BASE = "https://nedlasting.ngu.no/api/fileproxy/641a81c2-9354-473b-b8f0-2b1e2ab3930a";
const FILES = [
  { county: "oslo", id: "0ad0853f-7c8a-4546-b513-4a5c96019d43" },
  { county: "akershus", id: "5ed34284-6cfc-49ab-90d8-8e274bcc6731" },
];
// level: 5 = most likely ... 1 = rarely, 0 = mostly absent.
const LEVELS: Record<string, number> = {
  sværtStor: 5, sværtStorMenUsammenhengendeEllerTynt: 4, stor: 3, middels: 2, liten: 1, stortSettFraværende: 0,
};

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const levelCase = `CASE muligMarinLeire ${Object.entries(LEVELS).map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(" ")} END`;
const parts: string[] = [];
for (const f of FILES) {
  const zip = await download(`${BASE}/${f.id}`, `marin_leire_${f.county}.zip`);
  parts.push(`
    SELECT '${f.county}-' || OBJECTID AS id, muligMarinLeire AS class, muligMarinLeire_navn AS name,
      ${levelCase} AS level, losmassetype_navn AS soil,
      -- Outlines simplified to 1 m (in UTM metres), well inside the map's accuracy.
      ST_Transform(ST_SimplifyPreserveTopology(SHAPE, 1.0), 'EPSG:25833', 'EPSG:4326', always_xy := true) AS geom
    FROM ST_Read('/vsizip/${zip}/MuligMarinLeire.gdb', layer := 'MuligMarinLeireFlate')
    WHERE muligMarinLeire IN (${Object.keys(LEVELS).map((k) => `'${k}'`).join(", ")})`);
}

await conn.run(`
  CREATE OR REPLACE TABLE marin_leire AS
  SELECT * EXCLUDE (geom), 'NGU' AS source, ST_MakeValid(geom) AS geom
  FROM (${parts.join(" UNION ALL ")})
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ class: string; n: number }>(
  "SELECT class, count(*)::INTEGER AS n FROM marin_leire GROUP BY class, level ORDER BY level DESC",
);
console.log(`marin_leire: ${counts.map((c) => `${c.class}=${c.n}`).join(", ")}`);
