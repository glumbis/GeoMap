import { Hono } from "hono";
import { query } from "../db.ts";

// GET /api/health -> API status and the tables currently loaded in DuckDB.
export default new Hono().get("/", async (c) => {
  const tables = await query<{ name: string; rows: number }>(
    "SELECT table_name AS name, estimated_size::INTEGER AS rows FROM duckdb_tables() ORDER BY 1",
  );
  return c.json({ ok: true, tables });
});
