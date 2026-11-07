import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { query, tableExists } from "./db.ts";

/**
 * Standard map-layer endpoint: GET ?bbox=minLng,minLat,maxLng,maxLat&q=text&limit=1000
 * Returns a GeoJSON FeatureCollection from `table` (needs `geom` in EPSG:4326 and a `name` column).
 * Every other column becomes a feature property.
 */
/** Extra area around the requested bbox that clipped shapes keep, as a share of its width/height. */
const MARGIN = 0.5;

export async function layer(c: Context, table: string) {
  if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`bad table name: ${table}`);
  if (!(await tableExists(table))) {
    throw new HTTPException(503, { message: `Table '${table}' is not loaded. Run: npm run ingest ${table}` });
  }

  const where: string[] = [];
  const params: (string | number)[] = [];

  // With a bbox, each shape is cut to the view plus a margin, so a huge polygon (one radon area
  // has 27k points) sends only the part on screen. The margin keeps cut edges off screen while panning.
  let clip = "";
  const bbox = c.req.query("bbox");
  if (bbox) {
    const b = bbox.split(",").map(Number);
    if (b.length !== 4 || b.some((n) => !Number.isFinite(n))) {
      throw new HTTPException(400, { message: "bbox must be minLng,minLat,maxLng,maxLat" });
    }
    params.push(...b);
    where.push("ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4))");
    const [x0, y0, x1, y1] = b;
    const mx = (x1 - x0) * MARGIN, my = (y1 - y0) * MARGIN;
    clip = `ST_MakeEnvelope(${x0 - mx}, ${y0 - my}, ${x1 + mx}, ${y1 + my})`;
  }

  const q = c.req.query("q");
  if (q) {
    params.push(`%${q}%`);
    where.push(`name ILIKE $${params.length}`);
  }

  const limit = Math.min(Math.max(Math.floor(Number(c.req.query("limit") ?? 1000)) || 1000, 1), 10000);

  // Coordinates are rounded to 6 decimals (~10 cm); DuckDB otherwise sends 15.
  const sql = (geom: string) =>
    `SELECT to_json(t) AS f FROM (
       SELECT * EXCLUDE (geom), ST_AsGeoJSON(${geom}) AS __geometry
       FROM ${table}
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       LIMIT ${limit}
     ) t`;
  const shaped = `ST_ReducePrecision(${clip ? `ST_Intersection(geom, ${clip})` : "geom"}, 0.000001)`;
  let rows: { f: string }[];
  try {
    rows = await query<{ f: string }>(sql(shaped), params);
  } catch (err) {
    // A shape GEOS can't clip or round must not break the whole layer: send it unchanged.
    console.warn(`layer ${table}: clip/round failed, sending full shapes:`, (err as Error).message);
    rows = await query<{ f: string }>(sql("geom"), params);
  }

  return c.json({
    type: "FeatureCollection",
    features: rows.map((r) => {
      const { __geometry, ...properties } = JSON.parse(r.f);
      return { type: "Feature", geometry: typeof __geometry === "string" ? JSON.parse(__geometry) : __geometry, properties };
    }),
  });
}
