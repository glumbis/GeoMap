import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { query, tableExists } from "./db.ts";

/**
 * Standard map-layer endpoint: GET ?bbox=minLng,minLat,maxLng,maxLat&q=text&limit=1000
 * Returns a GeoJSON FeatureCollection from `table` (needs `geom` in EPSG:4326 and a `name` column).
 * Every other column becomes a feature property.
 */
export async function layer(c: Context, table: string) {
  if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`bad table name: ${table}`);
  if (!(await tableExists(table))) {
    throw new HTTPException(503, { message: `Table '${table}' is not loaded. Run: npm run ingest ${table}` });
  }

  const where: string[] = [];
  const params: (string | number)[] = [];

  const bbox = c.req.query("bbox");
  if (bbox) {
    const b = bbox.split(",").map(Number);
    if (b.length !== 4 || b.some((n) => !Number.isFinite(n))) {
      throw new HTTPException(400, { message: "bbox must be minLng,minLat,maxLng,maxLat" });
    }
    params.push(...b);
    where.push("ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4))");
  }

  const q = c.req.query("q");
  if (q) {
    params.push(`%${q}%`);
    where.push(`name ILIKE $${params.length}`);
  }

  const limit = Math.min(Math.max(Math.floor(Number(c.req.query("limit") ?? 1000)) || 1000, 1), 10000);

  const rows = await query<{ f: string }>(
    `SELECT to_json(t) AS f FROM (
       SELECT * EXCLUDE (geom), ST_AsGeoJSON(geom) AS __geometry
       FROM ${table}
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       LIMIT ${limit}
     ) t`,
    params,
  );

  return c.json({
    type: "FeatureCollection",
    features: rows.map((r) => {
      const { __geometry, ...properties } = JSON.parse(r.f);
      return { type: "Feature", geometry: typeof __geometry === "string" ? JSON.parse(__geometry) : __geometry, properties };
    }),
  });
}
