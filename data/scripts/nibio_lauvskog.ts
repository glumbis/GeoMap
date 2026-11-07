// Deciduous forest around addresses, for pollen allergy (birch, alder and hazel are the big pollen trees in Norway).
// Built from NIBIO AR50 (`arealtyper`, data/scripts/nibio_ar50.ts runs first: alphabetical order). Owner: Even.
// Same idea as Lukas's arealdekke.ts: a 100 m grid (EPSG:25833) of points that fall in AR50 forest with tree type
// lauvskog (deciduous) or blandingsskog (mixed). Counting points within 500 m gives the share cheaply.
// AR50 is coarse: street trees, gardens and small groves of birch in town are not in it.
// Matches the `deciduousForest` data point in api/src/datapoints.ts (info only).
import { conn, query } from "../../api/src/db.ts";

const STEP_M = 100;
await conn.run(`
  CREATE OR REPLACE TEMP TABLE lauv_poly AS
  SELECT treeType, ST_Transform(geom, 'EPSG:4326', 'EPSG:25833', always_xy := true) AS g
  FROM arealtyper WHERE treeType IN ('lauvskog', 'blandingsskog')`);
const [{ n }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM lauv_poly");
if (!n) throw new Error("No deciduous or mixed forest in arealtyper. Run: npm run ingest nibio_ar50");

// Grid points only inside each polygon's own bounding box, then the exact test: far fewer points than a full grid.
await conn.run(`
  CREATE OR REPLACE TABLE lauvskog AS
  WITH cand AS (
    SELECT p.treeType, p.g, ST_Point(x, y) AS pt
    FROM lauv_poly p,
      LATERAL generate_series(floor(ST_XMin(p.g) / ${STEP_M})::BIGINT, floor(ST_XMax(p.g) / ${STEP_M})::BIGINT) gx(i),
      LATERAL generate_series(floor(ST_YMin(p.g) / ${STEP_M})::BIGINT, floor(ST_YMax(p.g) / ${STEP_M})::BIGINT) gy(j),
      LATERAL (SELECT i * ${STEP_M} + ${STEP_M / 2} AS x, j * ${STEP_M} + ${STEP_M / 2} AS y)
  )
  SELECT any_value(treeType) AS treeType, any_value(treeType) AS name, 'NIBIO' AS source,
    ST_Transform(pt, 'EPSG:25833', 'EPSG:4326', always_xy := true) AS geom
  FROM cand WHERE ST_Intersects(g, pt)
  GROUP BY pt`);
const counts = await query<{ treeType: string; n: number }>("SELECT treeType, count(*)::INTEGER AS n FROM lauvskog GROUP BY 1 ORDER BY 1");
console.log(`lauvskog: ${counts.map((c) => `${c.treeType} ${c.n}`).join(", ")} grid points (100 m)`);
