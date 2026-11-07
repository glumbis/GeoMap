// Leisure places from OpenStreetMap for Oslo + Akershus: playgrounds, sports facilities and bathing spots.
// Licence ODbL, credit "© OpenStreetMap contributors". Owner: Even. Needs the `kommuner` table.
// Source: Overpass API (keyless), points and outlines (as their centre point). Same safety rules as tjenester.ts:
// a complete answer only, the last good answer is saved and reused, and a failure never stops `npm run ingest`.
// kind:
//   'lekeplass' leisure=playground
//   'idrett'    leisure=sports_centre | stadium | sports_hall | ice_rink, or a named leisure=pitch | track
//               (unnamed pitches are mostly single basketball hoops and school yards)
//   'badeplass' leisure=bathing_place, or natural=beach
// Matches the `playground`, `sportsFacility` and `bathingSpot` data points in api/src/datapoints.ts (info only).
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { conn, query, tableExists } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const ROUNDS = 3;
const MIN_ELEMENTS = 2000; // a full answer has several thousand objects
const LAST_GOOD = rawPath("fritid_overpass.json");

const [minLng, minLat, maxLng, maxLat] = await studyBbox();
const b = `(${minLat},${minLng},${maxLat},${maxLng})`;
const overpassQuery = `[out:json][timeout:180];(
  nwr["leisure"="playground"]${b};
  nwr["leisure"~"^(sports_centre|stadium|sports_hall|ice_rink)$"]${b};
  nwr["leisure"~"^(pitch|track)$"]["name"]${b};
  nwr["leisure"="bathing_place"]${b};
  nwr["natural"="beach"]${b};
);out tags center;`;

function complete(json: any): boolean {
  return Array.isArray(json?.elements) && !/error|timed out|out of memory/i.test(String(json.remark ?? "")) && json.elements.length >= MIN_ELEMENTS;
}

async function overpass(): Promise<any | null> {
  for (let round = 1; round <= ROUNDS; round++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": "GeoMap-hackathon", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: overpassQuery }),
          signal: AbortSignal.timeout(240_000),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        if (!complete(json)) throw new Error(`incomplete answer (${json?.elements?.length ?? 0} objects)`);
        return json;
      } catch (err) {
        console.warn(`  overpass round ${round}/${ROUNDS}, ${new URL(url).host}: ${(err as Error).message}`);
      }
    }
    if (round < ROUNDS) await new Promise((r) => setTimeout(r, 30_000 * round));
  }
  return null;
}

function kindOf(t: Record<string, string>): string | null {
  if (t.leisure === "playground") return "lekeplass";
  if (t.leisure === "bathing_place" || t.natural === "beach") return "badeplass";
  if (["sports_centre", "stadium", "sports_hall", "ice_rink", "pitch", "track"].includes(t.leisure)) return "idrett";
  return null;
}

let data = await overpass();
if (data) await writeFile(LAST_GOOD, JSON.stringify(data));
else if (existsSync(LAST_GOOD)) {
  console.warn("  fritid: every Overpass server failed; using the last good download");
  data = JSON.parse(await readFile(LAST_GOOD, "utf8"));
}

if (!data) {
  console.warn(`  fritid: SKIPPED, no Overpass answer and no earlier download.${(await tableExists("fritid")) ? " The existing table is kept." : ""}`);
} else {
  const rows = [];
  for (const e of data.elements as any[]) {
    const t = e.tags ?? {};
    const kind = kindOf(t);
    const lng = e.lon ?? e.center?.lon;
    const lat = e.lat ?? e.center?.lat;
    if (!kind || lng == null || lat == null) continue;
    rows.push({ id: `${e.type}/${e.id}`, kind, name: t.name ?? null, sport: t.sport ?? null, lng, lat });
  }
  const file = rawPath("fritid.json");
  await writeFile(file, JSON.stringify(rows));
  // One row per OSM object. name falls back to the kind in Norwegian.
  await conn.run(`
    CREATE OR REPLACE TABLE fritid AS
    SELECT * FROM (
      SELECT id, kind,
        coalesce(name, CASE kind WHEN 'lekeplass' THEN 'Lekeplass' WHEN 'badeplass' THEN 'Badeplass' ELSE 'Idrettsanlegg' END) AS name,
        name IS NOT NULL AS named, sport, 'OpenStreetMap' AS source, ST_Point(lng, lat) AS geom
      FROM read_json('${file}', columns = { id: 'VARCHAR', kind: 'VARCHAR', name: 'VARCHAR', sport: 'VARCHAR', lng: 'DOUBLE', lat: 'DOUBLE' })
    ) WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  `);
  const counts = await query<{ kind: string; n: number }>("SELECT kind, count(*)::INTEGER AS n FROM fritid GROUP BY 1 ORDER BY 1");
  console.log(`fritid: ${counts.map((c) => `${c.kind} ${c.n}`).join(", ")}`);
}
