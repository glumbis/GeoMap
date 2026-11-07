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

export type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

/** Bounding box of the study area (the `kommuner` table). Throws if kommuner isn't loaded. */
export async function studyBbox(): Promise<Bbox> {
  const { query } = await import("../../api/src/db.ts");
  const [b] = await query<{ minx: number; miny: number; maxx: number; maxy: number }>(`
    SELECT min(ST_XMin(geom)) AS minx, min(ST_YMin(geom)) AS miny, max(ST_XMax(geom)) AS maxx, max(ST_YMax(geom)) AS maxy
    FROM kommuner`);
  if (b?.minx == null) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");
  return [b.minx, b.miny, b.maxx, b.maxy];
}

/**
 * Every feature of an ArcGIS REST layer (NVE uses these) inside bbox, as GeoJSON features in EPSG:4326.
 * Pages through the layer 1000 at a time. `tag` is merged into every feature's properties.
 * layerUrl: e.g. "https://kart.nve.no/enterprise/rest/services/Flomsoner2/MapServer/17"
 */
export async function arcgisFeatures(
  layerUrl: string,
  bbox: Bbox,
  opts: { where?: string; outFields?: string; tag?: Record<string, unknown> } = {},
): Promise<any[]> {
  const PAGE = 1000;
  const features: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where: opts.where ?? "1=1",
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: opts.outFields ?? "objectid",
      outSR: "4326",
      orderByFields: "objectid",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: "geojson",
    });
    const page = await getJson(`${layerUrl}/query?${params}`);
    if (page.error) throw new Error(`${layerUrl}: ${JSON.stringify(page.error)}`);
    for (const f of page.features) Object.assign(f.properties, opts.tag);
    features.push(...page.features);
    if (page.features.length < PAGE) return features;
  }
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
