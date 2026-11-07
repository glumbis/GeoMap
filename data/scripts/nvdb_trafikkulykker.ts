// Police-recorded road accidents with personal injury in Oslo + Akershus since 2016, from Statens vegvesen NVDB
// (object type 570 "Trafikkulykke", NLOD, keyless). Owner: Even. Needs the `kommuner` table.
// Matches the `trafficAccidents` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";
import { nvdbObjects } from "./nvdb.ts";

const SINCE = 2016; // also in the trafficAccidents display text
const objects = await nvdbObjects(570, await studyBbox(), `11910>=${SINCE}`);
const file = rawPath("trafikkulykker.csv");
const q = (v: unknown) => (v == null ? "" : `"${String(v).replaceAll('"', '""')}"`);
await writeFile(
  file,
  "id,date,year,type,pedestrians,cyclists,speedLimit,wkt\n" +
    objects
      .map((o) =>
        [o.id, o.props["Ulykkesdato"], o.props["År (Ny)"], q(o.props["Ulykkestype (Ny)"]), o.props["Antall Fotgjengere (Ny)"] ?? 0,
          o.props["Antall Sykkel (Ny)"] ?? 0, o.props["Fartsgrense"], q(o.wkt)].join(","))
      .join("\n"),
);

// One row per accident. type = Statens vegvesen's accident type ("Fotgjenger/akende", ...).
// pedestrians / cyclists = how many of the units involved were pedestrians or bikes.
await conn.run(`
  CREATE OR REPLACE TABLE trafikkulykker AS
  SELECT id, coalesce(type, 'Trafikkulykke') AS name, date::DATE AS date, year::INTEGER AS year, type,
    pedestrians::INTEGER AS pedestrians, cyclists::INTEGER AS cyclists, speedLimit::INTEGER AS speedLimit,
    'Statens vegvesen' AS source, ST_GeomFromText(wkt) AS geom
  FROM read_csv('${file}', header = true, all_varchar = true)
  WHERE ST_Intersects(ST_GeomFromText(wkt), (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [c] = await query<{ n: number; first: number; last: number; soft: number }>(
  "SELECT count(*)::INTEGER AS n, min(year) AS first, max(year) AS last, count(*) FILTER (WHERE pedestrians > 0 OR cyclists > 0)::INTEGER AS soft FROM trafikkulykker",
);
console.log(`trafikkulykker: ${c.n} accidents ${c.first}–${c.last} (${c.soft} with a pedestrian or cyclist; ${objects.length} fetched in bbox)`);
