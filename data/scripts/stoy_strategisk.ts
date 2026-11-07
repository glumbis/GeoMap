// Strategic road noise map (strategisk støykartlegging, Lden) in Oslo + Akershus, from Statens vegvesen's WFS
// (NLOD, keyless). Owner: Even. Needs the `kommuner` table. Used by the `roadNoiseStrategic` data point.
// Unlike `veistoy` (T-1442, riks- and fylkesveg only, forecast 2040), this covers Oslo incl. municipal roads.
// It is the situation in 2021, in 5 dB bands: lden = lower bound (50 = 50–55 dB, ..., 75 = 75 dB and more).
// No zone at a point means "below 50 dB" OR "not mapped": the map has no coverage outline, so we can't tell.
// The source uses old municipality numbers ("301", "3024"), so kommunenummer is set from today's `kommuner` by location.
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

const zones: any[] = [];
for (let start = 0; ; start += PAGE) {
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "norstoy_1_0:Strategiskstoykart_lden",
    outputFormat: "application/json", srsName: "EPSG:4326", sortBy: "BEREGNINGSID",
    count: String(PAGE), startIndex: String(start),
    // WFS 2.0 with an EPSG URN wants lat,lng order in the bbox
    bbox: `${ext.minLat},${ext.minLng},${ext.maxLat},${ext.maxLng},urn:ogc:def:crs:EPSG::4326`,
  });
  const page = await getJson(`${WFS}?${params}`);
  for (const f of page.features) {
    const lden = Number(f.properties["STØYINTERVALL"]);
    if (!f.geometry || !Number.isFinite(lden)) continue;
    const band = lden >= 75 ? "over 75 dB" : `${lden}–${lden + 5} dB`;
    zones.push({
      type: "Feature",
      geometry: f.geometry,
      properties: { lden, name: `Veistøy ${band} (strategisk støykart)`, year: Number(f.properties["BEREGNETÅR"]) || null },
    });
  }
  console.log(`  fetched ${start + page.features.length}`);
  if (page.features.length < PAGE) break;
}

const file = rawPath("stoy_strategisk.geojson");
await writeFile(file, JSON.stringify({ type: "FeatureCollection", features: zones }));

// Simplify by ~1 m (0.00001°) to keep the map layer light; the bands are 5 dB wide, so this changes nothing that matters.
await conn.run(`
  CREATE OR REPLACE TABLE stoy_strategisk AS
  WITH z AS (
    SELECT lden::INTEGER AS lden, name, year::INTEGER AS year,
           ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00001)) AS geom
    FROM ST_Read('${file}')
  )
  SELECT z.lden, z.name, z.year, k.kommunenummer, 'Statens vegvesen' AS source, z.geom
  FROM z JOIN kommuner k ON ST_Intersects(ST_PointOnSurface(z.geom), k.geom)
`);
const counts = await query<{ lden: number; n: number }>(
  "SELECT lden, count(*)::INTEGER AS n FROM stoy_strategisk GROUP BY 1 ORDER BY 1",
);
console.log(`stoy_strategisk: ${counts.map((c) => `${c.n}×${c.lden}`).join(", ")} dB (of ${zones.length} fetched)`);
