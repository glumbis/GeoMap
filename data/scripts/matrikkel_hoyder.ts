// Ground elevation (metres above sea level, NN2000) at every dwelling building in `bygninger`, from Kartverket's
// height API (ws.geonorge.no/hoydedata/v1/punkt, DTM 1 m, keyless, CC BY 4.0). Owner: Even.
// Needs the `bygninger` table (data/scripts/matrikkel_bygninger.ts runs first: scripts run in alphabetical order).
// 50 points per request, 8 requests in flight. Matches the `elevation` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const API = "https://ws.geonorge.no/hoydedata/v1/punkt";
const BATCH = 50;
const points = await query<{ id: string; lng: number; lat: number }>(
  "SELECT id, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM bygninger",
);
if (!points.length) throw new Error("bygninger table is empty. Run: npm run ingest matrikkel_bygninger");

async function heights(batch: typeof points): Promise<{ z: number | null; terrain: string | null }[]> {
  const url = `${API}?koordsys=4258&punkter=${encodeURIComponent(JSON.stringify(batch.map((p) => [p.lng, p.lat])))}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "GeoMap-hackathon" }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      return json.punkter.map((p: any) => ({ z: p.z ?? null, terrain: p.terreng ?? null }));
    } catch (err) {
      if (attempt >= 5) { console.warn(`\n  hoyder: batch failed (${(err as Error).message}), left out`); return batch.map(() => ({ z: null, terrain: null })); }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const out: { id: string; lng: number; lat: number; z: number | null; terrain: string | null }[] = [];
const batches = Array.from({ length: Math.ceil(points.length / BATCH) }, (_, i) => points.slice(i * BATCH, (i + 1) * BATCH));
let next = 0;
let done = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < batches.length) {
    const b = batches[next++];
    const h = await heights(b);
    b.forEach((p, i) => out.push({ ...p, ...h[i] }));
    if (++done % 100 === 0) process.stdout.write(`\r  hoyder: ${Math.min(done * BATCH, points.length)} / ${points.length}`);
  }
}));
process.stdout.write("\n");

const file = rawPath("bygning_hoyder.json");
await writeFile(file, JSON.stringify(out.filter((p) => p.z != null)));
// One row per dwelling building with a height. heightM = ground at the building point (DTM, NN2000).
await conn.run(`
  CREATE OR REPLACE TABLE bygning_hoyder AS
  SELECT id, round(z, 1) || ' moh.' AS name, round(z, 1) AS heightM, terrain, 'Kartverket' AS source, ST_Point(lng, lat) AS geom
  FROM read_json('${file}', columns = { id: 'VARCHAR', lng: 'DOUBLE', lat: 'DOUBLE', z: 'DOUBLE', terrain: 'VARCHAR' })
`);
const [c] = await query<{ n: number; lo: number; hi: number }>("SELECT count(*)::INTEGER AS n, min(heightM) AS lo, max(heightM) AS hi FROM bygning_hoyder");
console.log(`bygning_hoyder: ${c.n} buildings, ${c.lo}–${c.hi} moh.`);
