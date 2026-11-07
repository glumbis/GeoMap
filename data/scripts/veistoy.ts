// Road noise zones (støyvarselkart etter T-1442) in Oslo + Akershus, from Statens vegvesen's WFS (NLOD, keyless).
// Owner: Even. Needs the `kommuner` table. Table name and `stoysone` column match `roadNoise` in api/src/datapoints.ts.
// Red zone: Lden > 65 dB, yellow: Lden > 55 dB, forecast 15–20 years ahead at 4 m height.
// Only national and county roads: no data on municipal roads, so central Oslo is empty (see SOURCES.md).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const WFS = "https://www.vegvesen.no/kart/ogc/norstoy_1_0/ows";
const PAGE = 2000;

const [ext] = await query<{ minLng: number; minLat: number; maxLng: number; maxLat: number }>(`
  SELECT ST_XMin(g) AS minLng, ST_YMin(g) AS minLat, ST_XMax(g) AS maxLng, ST_YMax(g) AS maxLat
  FROM (SELECT ST_Extent_Agg(geom) AS g FROM kommuner)
`);
if (!ext?.minLng) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const features: any[] = [];
for (let start = 0; ; start += PAGE) {
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "norstoy_1_0:Stoyvarselkart",
    outputFormat: "application/json", srsName: "EPSG:4326", sortBy: "BEREGNINGSID",
    count: String(PAGE), startIndex: String(start),
    // WFS 2.0 with an EPSG URN wants lat,lng order in the bbox
    bbox: `${ext.minLat},${ext.minLng},${ext.maxLat},${ext.maxLng},urn:ogc:def:crs:EPSG::4326`,
  });
  const page = await getJson(`${WFS}?${params}`);
  features.push(...page.features);
  if (page.features.length < PAGE) break;
}

const zones = features
  .filter((f) => f.geometry && ["R", "G"].includes(f.properties["STØYSONEKATEGORI"]))
  .map((f) => {
    const red = f.properties["STØYSONEKATEGORI"] === "R";
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        stoysone: red ? "rød" : "gul",
        name: red ? "Rød støysone (vei)" : "Gul støysone (vei)",
        forecastYear: Number(f.properties["BEREGNETÅR"]) || null,
        calculated: f.properties["DATAFANGSTDATO"] ?? null, // yyyymmdd
      },
    };
  });

const file = rawPath("veistoy.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features: zones }));

await conn.run(`
  CREATE OR REPLACE TABLE veistoy AS
  WITH z AS (
    SELECT stoysone, name, forecastYear::INTEGER AS forecastYear, calculated, ST_MakeValid(geom) AS geom
    FROM ST_Read('${file}')
  )
  SELECT z.* EXCLUDE (geom), 'Statens vegvesen' AS source, z.geom
  FROM z
  WHERE ST_Intersects(z.geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ stoysone: string; n: number }>(
  "SELECT stoysone, count(*)::INTEGER AS n FROM veistoy GROUP BY 1 ORDER BY 1",
);
console.log(`veistoy: ${counts.map((c) => `${c.n} ${c.stoysone}`).join(", ")} (of ${features.length} in the bounding box)`);
