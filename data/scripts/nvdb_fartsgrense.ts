// Speed limits per road stretch in Oslo + Akershus, from Statens vegvesen NVDB (object type 105 "Fartsgrense",
// NLOD, keyless). Owner: Even. Needs the `kommuner` table. Covers public roads, municipal streets included.
// Matches the `speedLimit` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";
import { nvdbObjects } from "./nvdb.ts";

const objects = await nvdbObjects(105, await studyBbox());
const file = rawPath("fartsgrenser.csv");
await writeFile(
  file,
  "id,kmh,wkt\n" + objects.filter((o) => o.props["Fartsgrense"] != null).map((o) => `${o.id},${o.props["Fartsgrense"]},"${o.wkt}"`).join("\n"),
);

// One row per NVDB stretch. kmh = posted speed limit.
await conn.run(`
  CREATE OR REPLACE TABLE fartsgrenser AS
  SELECT id, kmh || ' km/t' AS name, kmh::INTEGER AS kmh, 'Statens vegvesen' AS source, ST_GeomFromText(wkt) AS geom
  FROM read_csv('${file}', header = true, all_varchar = true)
  WHERE ST_Intersects(ST_GeomFromText(wkt), (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ kmh: number; n: number }>("SELECT kmh, count(*)::INTEGER AS n FROM fartsgrenser GROUP BY 1 ORDER BY 1");
console.log(`fartsgrenser: ${counts.map((c) => `${c.kmh}=${c.n}`).join(", ")} (${objects.length} fetched in bbox)`);
