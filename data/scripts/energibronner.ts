// Energy wells (energibrønner, for ground-source heat pumps) in Oslo + Akershus, from NGU's Granada
// well database via its OGC API Features service (NLOD 2.0, credit NGU, keyless). Owner: Even. Needs `kommuner`.
// Matches the `energyWell` data point in api/src/datapoints.ts (nearest within 500 m, info only).
// depthToBedrockM (boretLengdeTilBerg) is how far the driller went through soil before hitting rock.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath, studyBbox } from "./lib.ts";

const ITEMS = "https://geo.ngu.no/api/features/grunnvannborehull/collections/energibronn/items";
const PAGE = 10000;

const bbox = await studyBbox();
const features: any[] = [];
for (let offset = 0; ; offset += PAGE) {
  const page = await getJson(`${ITEMS}?f=json&limit=${PAGE}&offset=${offset}&bbox=${bbox.join(",")}`);
  features.push(...page.features);
  if (page.features.length < PAGE) break;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const wells = features
  .filter((f) => f.geometry)
  .map((f) => {
    const p = f.properties;
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        wellId: String(f.id),
        drilledM: num(p.boretLengde),
        depthToBedrockM: num(p.boretLengdeTilBerg),
        drillYear: p.boreDato ? Number(String(p.boreDato).slice(0, 4)) : null,
        use: p.brønnBrukOmfang || null, // e.g. Enkelthusholdning
        factSheet: p["rapport-HTML"]?.href ?? null,
      },
    };
  });

const file = rawPath("energibronner.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features: wells }));

await conn.run(`
  CREATE OR REPLACE TABLE energibronner AS
  SELECT 'Energibrønn ' || wellId AS name, wellId, drilledM, depthToBedrockM, drillYear::INTEGER AS drillYear, use, factSheet,
    'NGU' AS source, geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [c] = await query<{ n: number; withRock: number }>(
  "SELECT count(*)::INTEGER AS n, count(depthToBedrockM)::INTEGER AS withRock FROM energibronner",
);
console.log(`energibronner: ${c.n} wells (${c.withRock} with depth to bedrock), of ${features.length} fetched`);
