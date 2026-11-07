// Small shared helpers for ingest scripts.
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAW_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../raw");
mkdirSync(RAW_DIR, { recursive: true });
const headers = { "User-Agent": "GeoMap-hackathon" };

/** Absolute path in data/raw/ (forward slashes, safe inside DuckDB SQL strings). */
export const rawPath = (name: string) => resolve(RAW_DIR, name).replaceAll("\\", "/");

/** fetch + JSON, throws on non-2xx. */
export async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

/** Download a file to data/raw/<name> (skipped if it exists, unless force). Returns its path. */
export async function download(url: string, name: string, force = false): Promise<string> {
  const path = rawPath(name);
  if (force || !existsSync(path)) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}
