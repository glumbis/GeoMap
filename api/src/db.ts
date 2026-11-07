import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Shared DuckDB connection. One file holds all data: data/geomap.duckdb.
// DuckDB allows one writing process per file: stop the API before running an ingest script.
export const DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/geomap.duckdb");

mkdirSync(dirname(DB_PATH), { recursive: true });
const instance = await DuckDBInstance.create(DB_PATH);
export const conn = await instance.connect();
await conn.run("INSTALL spatial; LOAD spatial;");

/** Run a query with `$1, $2, ...` params and return rows as plain JSON-safe objects. */
export async function query<T = Record<string, unknown>>(sql: string, params: DuckDBValue[] = []): Promise<T[]> {
  const reader = await conn.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as T[];
}

/** True if a table exists (lets routes say "not loaded" instead of crashing). */
export async function tableExists(name: string): Promise<boolean> {
  const rows = await query("SELECT 1 FROM duckdb_tables() WHERE table_name = $1", [name]);
  return rows.length > 0;
}
