// How much nature is around an address: Kartverket N50 land cover (arealdekke) for Oslo + Akershus (CC BY 4.0, keyless).
// Owner: Lukas. Needs the `kommuner` table. Matches the `greenArea` data point in api/src/datapoints.ts.
//
// Why: the nature score used to lean on the nearest *protected* or *state-secured* area. Those are rare (182 / 326
// areas), so a house in the middle of Nordmarka could score low. Land cover says what is actually around.
//
// The table is not the polygons: it is a 100 m grid of points (EPSG:25833 grid, stored as lng, lat) that fall in
// nature, one row per point with its land-cover kind. Counting points within 500 m gives the nature share cheaply
// (≈ 79 grid points in a 500 m circle), without clipping big forest polygons for every address.
// Nature = skog, myr, åpent område (open land, rock, meadow), park, innsjø, elv. Not counted: sea, farmland,
// built-up land, sports grounds, graveyards, golf courses, quarries.
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const BASE = "https://nedlasting.geonorge.no/geonorge/Basisdata/N50Kartdata/FGDB";
const COUNTIES = ["03_Oslo", "32_Akershus"];
const STEP_M = 100;
const KIND: Record<string, string> = {
  Skog: "skog", Myr: "myr", "ÅpentOmråde": "åpent område", Park: "park",
  "Innsjø": "vann", "InnsjøRegulert": "vann", Elv: "vann",
};

const parts: string[] = [];
for (const county of COUNTIES) {
  const name = `Basisdata_${county}_25833_N50Kartdata_FGDB`;
  const zip = await download(`${BASE}/${name}.zip`, `arealdekke_${county}.zip`);
  parts.push(`SELECT objtype, SHAPE AS g FROM ST_Read('/vsizip/${zip}/${name}.gdb', layer = 'N50_Arealdekke_omrade')`);
}
const kinds = Object.entries(KIND).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(" ");

await conn.run(`
  CREATE OR REPLACE TEMP TABLE natur_poly AS
  SELECT CASE objtype ${kinds} END AS kind, g
  FROM (${parts.join(" UNION ALL ")})
  WHERE objtype IN (${Object.keys(KIND).map((k) => `'${k}'`).join(", ")}) AND g IS NOT NULL`);

// Grid over the study area in UTM 33 (metres), kept only inside a municipality.
await conn.run(`
  CREATE OR REPLACE TEMP TABLE study_utm AS
  SELECT ST_Transform(geom, 'EPSG:4326', 'EPSG:25833', always_xy := true) AS g FROM kommuner`);
await conn.run(`
  CREATE OR REPLACE TEMP TABLE grid AS
  WITH b AS (SELECT floor(min(ST_XMin(g)) / ${STEP_M}) * ${STEP_M} AS x0, floor(min(ST_YMin(g)) / ${STEP_M}) * ${STEP_M} AS y0,
                    max(ST_XMax(g)) AS x1, max(ST_YMax(g)) AS y1 FROM study_utm)
  SELECT ST_Point(x, y) AS p
  FROM b, generate_series(0, ((x1 - x0) / ${STEP_M})::BIGINT) gx(i), generate_series(0, ((y1 - y0) / ${STEP_M})::BIGINT) gy(j),
       LATERAL (SELECT x0 + i * ${STEP_M} + ${STEP_M / 2} AS x, y0 + j * ${STEP_M} + ${STEP_M / 2} AS y)`);
await conn.run(`
  CREATE OR REPLACE TEMP TABLE grid_in AS
  SELECT DISTINCT grid.p FROM grid JOIN study_utm s ON ST_Intersects(s.g, grid.p)`);

await conn.run(`
  CREATE OR REPLACE TABLE arealdekke AS
  SELECT any_value(n.kind) AS kind, any_value(n.kind) AS name, 'Kartverket N50' AS source,
         ST_Transform(g.p, 'EPSG:25833', 'EPSG:4326', always_xy := true) AS geom
  FROM grid_in g JOIN natur_poly n ON ST_Intersects(n.g, g.p)
  GROUP BY g.p`);

const counts = await query<{ kind: string; n: number }>("SELECT kind, count(*)::INTEGER AS n FROM arealdekke GROUP BY 1 ORDER BY 2 DESC");
const [all] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM grid_in");
console.log(`arealdekke: ${all.n} grid points, nature in ${counts.reduce((s, c) => s + c.n, 0)} (${counts.map((c) => `${c.n} ${c.kind}`).join(", ")})`);
