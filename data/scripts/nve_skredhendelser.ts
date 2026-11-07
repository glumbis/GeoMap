// Registered slide events (landslides, quick-clay slides, rockfall, snow avalanches, road slips) in Oslo + Akershus,
// from NVE's national slide database (Skredhendelser2, layer 0 = release point; NLOD, credit "NVE"). Owner: Even.
// Needs the `kommuner` table. Only events NVE has registered: old and small slides are often missing.
// Matches the `pastSlides` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, getJson, rawPath, studyBbox } from "./lib.ts";

const LAYER = "https://kart.nve.no/enterprise/rest/services/Skredhendelser2/MapServer/0";

// Slide type codes -> names, from the layer's own domain (e.g. 141 "Kvikkleireskred").
const meta = await getJson(`${LAYER}?f=json`);
const types: Record<string, string> = Object.fromEntries(
  (meta.fields.find((f: any) => f.name === "skredtype")?.domain?.codedValues ?? []).map((v: any) => [String(v.code), v.name]),
);

const features = await arcgisFeatures(LAYER, await studyBbox(), {
  outFields: "objectid,skredtype,skrednavn,stedsnavn,skredtidspunkt,noyposisjon,totantpersomkommet,regstatus",
});
for (const f of features) {
  const p = f.properties;
  p.typeName = types[String(p.skredtype)] ?? "Skred";
  // skredtidspunkt is epoch ms; NULL when NVE does not know when it happened.
  p.date = p.skredtidspunkt != null ? new Date(p.skredtidspunkt).toISOString().slice(0, 10) : null;
}
const file = rawPath("skredhendelser.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

// One row per event. typeName is NVE's slide type ("Kvikkleireskred", "Steinsprang", "Utglidning av veg", ...).
// positionAccuracy is NVE's own ("Eksakt", "Innenfor 100 m", ...). deaths = people killed (NULL = not recorded).
await conn.run(`
  CREATE OR REPLACE TABLE skredhendelser AS
  SELECT objectid AS id,
    coalesce(nullif(trim(skrednavn), ''), nullif(trim(stedsnavn), ''), typeName) AS name,
    typeName, skredtype::INTEGER AS typeCode, date::DATE AS date, year(date::DATE) AS year,
    noyposisjon AS positionAccuracy, totantpersomkommet::INTEGER AS deaths, regstatus AS status,
    'NVE' AS source, geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ typeName: string; n: number }>(
  "SELECT typeName, count(*)::INTEGER AS n FROM skredhendelser GROUP BY 1 ORDER BY 2 DESC LIMIT 6",
);
console.log(`skredhendelser: ${counts.map((c) => `${c.typeName} ${c.n}`).join(", ")} (${features.length} fetched in bbox)`);
