// Traffic volume (ÅDT, average vehicles per day) per road link in Oslo + Akershus, from Statens vegvesen NVDB
// (object type 540 "Trafikkmengde", NLOD, keyless). Owner: Even. Needs the `kommuner` table.
// Covers European, national and county roads and some municipal roads; most small residential streets have no count.
// Matches the `trafficVolume` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";
import { nvdbObjects } from "./nvdb.ts";

const objects = await nvdbObjects(540, await studyBbox());
const file = rawPath("trafikkmengde.csv");
const q = (v: unknown) => (v == null ? "" : `"${String(v).replaceAll('"', '""')}"`);
await writeFile(
  file,
  "id,aadt,heavyPct,year,basis,wkt\n" +
    objects.map((o) => [o.id, o.props["ÅDT, total"], o.props["ÅDT, andel lange kjøretøy"], o.props["År, gjelder for"], q(o.props["Grunnlag for ÅDT"]), q(o.wkt)].join(",")).join("\n"),
);

// One row per NVDB road link with a count. aadt = vehicles per day, both directions; heavyPct = share of long vehicles.
await conn.run(`
  CREATE OR REPLACE TABLE trafikkmengde AS
  SELECT id, 'ÅDT ' || aadt AS name, aadt::INTEGER AS aadt, heavyPct::INTEGER AS heavyPct, year::INTEGER AS year, basis,
    'Statens vegvesen' AS source, ST_GeomFromText(wkt) AS geom
  FROM read_csv('${file}', header = true, all_varchar = true)
  WHERE aadt IS NOT NULL AND ST_Intersects(ST_GeomFromText(wkt), (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [c] = await query<{ n: number; maxAadt: number; year: number }>(
  "SELECT count(*)::INTEGER AS n, max(aadt) AS maxAadt, max(year) AS year FROM trafikkmengde",
);
console.log(`trafikkmengde: ${c.n} road links (max ÅDT ${c.maxAadt}, latest year ${c.year}; ${objects.length} fetched in bbox)`);
