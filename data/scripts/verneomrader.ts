// Protected nature areas (naturvernområder: nasjonalpark, naturreservat, landskapsvernområde, ...) in Oslo + Akershus,
// from Miljødirektoratet's Naturbase ArcGIS service (NLOD 2.0, credit Miljødirektoratet, keyless). Owner: Even.
// Needs the `kommuner` table. Matches the `protectedNature` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { arcgisFeatures, rawPath, studyBbox } from "./lib.ts";

const LAYER = "https://kart.miljodirektoratet.no/arcgis/rest/services/vern/MapServer/0";

// Naturbase's verneform codes -> plain bokmål.
const TYPES: Record<string, string> = {
  Nasjonalpark: "nasjonalpark", Naturreservat: "naturreservat", Landskapsvernomraade: "landskapsvernområde",
  LandskapsvernomraadePlantelivsfredning: "landskapsvernområde med plantelivsfredning", Naturminne: "naturminne",
  Dyrefredningsomrade: "dyrefredningsområde", Dyrelivsfredning: "dyrelivsfredning", BiotopvernVilt: "biotopvernområde",
  Plantefredningsomraade: "plantefredningsområde", Plantelivsfredning: "plantelivsfredning",
};

const features = await arcgisFeatures(LAYER, await studyBbox(), {
  outFields: "objectid,naturvernId,navn,offisieltNavn,verneform,vernedato,faktaark",
});
const areas = features
  .filter((f) => f.geometry)
  .map((f) => {
    const p = f.properties;
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        areaId: p.naturvernId || String(p.objectid),
        name: p.offisieltNavn || p.navn || null, // e.g. "Kolsås-Dælivann landskapsvernområde"
        shortName: p.navn || null,
        protectionType: p.verneform ? (TYPES[p.verneform] ?? p.verneform) : null, // e.g. landskapsvernområde
        protectedSince: p.vernedato ? new Date(p.vernedato).toISOString().slice(0, 10) : null,
        factSheet: p.faktaark || null,
      },
    };
  });

const file = rawPath("verneomrader.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features: areas }));

await conn.run(`
  CREATE OR REPLACE TABLE verneomrader AS
  SELECT name, areaId, shortName, protectionType, protectedSince, factSheet, 'Miljødirektoratet' AS source,
    ST_MakeValid(geom) AS geom
  FROM ST_Read('${file}')
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ t: string; n: number }>(
  "SELECT coalesce(protectionType, '?') AS t, count(*)::INTEGER AS n FROM verneomrader GROUP BY 1 ORDER BY 2 DESC",
);
console.log(`verneomrader: ${counts.map((c) => `${c.n} × ${c.t}`).join(", ")}`);
