// Municipality boundaries for Oslo (03) + Akershus (32), from Geonorge kommuneinfo (Kartverket, NLOD/CC BY 4.0).
// Template for an ingest script: download -> data/raw/ -> CREATE OR REPLACE TABLE.
// Other scripts can clip to the study area with:
//   WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
import { writeFile } from "node:fs/promises";
import { conn } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const API = "https://ws.geonorge.no/kommuneinfo/v1";
const FYLKER = ["03", "32"];

const features = [];
for (const fylke of FYLKER) {
  const f = await getJson(`${API}/fylker/${fylke}`);
  for (const k of f.kommuner) {
    const area = await getJson(`${API}/kommuner/${k.kommunenummer}/omrade?utkoordsys=4326`);
    features.push({
      type: "Feature",
      geometry: area.omrade,
      properties: { kommunenummer: k.kommunenummer, name: k.kommunenavn, fylkesnummer: fylke, fylkesnavn: f.fylkesnavn },
    });
  }
}

const file = rawPath("kommuner.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

await conn.run(`
  CREATE OR REPLACE TABLE kommuner AS
  SELECT kommunenummer, name, fylkesnummer, fylkesnavn, 'Kartverket' AS source, geom
  FROM ST_Read('${file}')
`);
console.log(`kommuner: ${features.length} rows`);
