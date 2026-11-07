// State-secured outdoor recreation areas (statlig sikra friluftslivsområder: beaches, swimming spots, parks, forest
// areas kept open to everyone) in Oslo + Akershus, from Miljødirektoratet's ArcGIS service (NLOD 2.0, keyless).
// Owner: Even. Needs the `kommuner` table. Matches the `recreationArea` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const LAYER = "https://kart.miljodirektoratet.no/arcgis/rest/services/friluftsliv_statlig_sikra/MapServer/0";

const features = await arcgisFeatures(LAYER, await studyBbox(), {
  outFields: "objectid,friluftId,omraadeNavn,omraadeBeskrivelse,faktaark",
});
const areas = features
  .filter((f) => f.geometry)
  .map((f) => {
    const p = f.properties;
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        areaId: p.friluftId || String(p.objectid),
        name: p.omraadeNavn?.trim() || null,
        description: p.omraadeBeskrivelse?.trim() || null,
        factSheet: p.faktaark || null,
      },
    };
  });

const file = rawPath("friluftsomrader.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features: areas }));

await conn.run(`
  CREATE OR REPLACE TABLE friluftsomrader AS
  SELECT name, areaId, description, factSheet, 'Miljødirektoratet' AS source, ST_MakeValid(geom) AS geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [c] = await query<{ n: number; named: number }>(
  "SELECT count(*)::INTEGER AS n, count(name)::INTEGER AS named FROM friluftsomrader",
);
console.log(`friluftsomrader: ${c.n} areas (${c.named} named)`);
