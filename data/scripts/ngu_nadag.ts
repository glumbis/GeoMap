// Geotechnical boreholes in Oslo + Akershus from NADAG (Nasjonal database for grunnundersøkelser), NGU's
// OGC API Features (keyless, NLOD, credit "NGU"). Owner: Even. Needs the `kommuner` table.
// About 270 000 boreholes: paged 1000 at a time, 6 requests in flight, each retried on errors.
// Kept: drilled depth to bedrock (when the drill reached rock), deepest drilled length, and whether quick clay was
// found (kvikkleirePåvisning: Sikker / Antatt / Usikker / IkkeVurdert; empty for most old boreholes).
// Matches the `depthToBedrock` and `quickClayBoreholes` data points in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";

const ITEMS = "https://geo.ngu.no/api/features/grunnundersokelser_utvidet/collections/geotekniskborehull/items";
const PAGE = 1000;
const bbox = (await studyBbox()).join(",");

async function page(offset: number): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${ITEMS}?f=json&limit=${PAGE}&offset=${offset}&bbox=${bbox}`, {
        headers: { Accept: "application/geo+json", "User-Agent": "GeoMap-hackathon" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 5) throw new Error(`NADAG offset ${offset}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

const first = await page(0);
const total: number = first.numberMatched;
const offsets = Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i * PAGE);
const pages: any[] = [first];
let next = 1;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < offsets.length) {
    const i = next++;
    pages[i] = await page(offsets[i]);
    process.stdout.write(`\r  NADAG: ${Math.min((i + 1) * PAGE, total)} / ${total}`);
  }
}));
process.stdout.write("\n");

const rows = [];
for (const p of pages) for (const f of p.features ?? []) {
  const q = f.properties;
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (lng == null) continue;
  rows.push({
    id: f.id, lng, lat,
    depthToRock: q["boretLengdeTilBerg.borlengdeTilBerg"] ?? null,
    maxDrilled: q.maksBoretLengde ?? null,
    quickClay: q["kvikkleirePåvisning"] ?? null,
    date: (q.datafangstdato ?? q.opprettetDato ?? "").slice(0, 10) || null,
    origin: q.opphav ?? null,
  });
}
const file = rawPath("nadag.json");
await writeFile(file, JSON.stringify(rows));

// One row per borehole. depthToRock in metres (NULL = rock not reached or not recorded); maxDrilled = deepest drilling;
// quickClay = NADAG's quick-clay finding ('Sikker', 'Antatt', 'Usikker', 'IkkeVurdert', or NULL when not given).
await conn.run(`
  CREATE OR REPLACE TABLE nadag AS
  SELECT * FROM (
    SELECT id, 'Grunnboring' AS name, depthToRock, maxDrilled, quickClay, date::DATE AS date, year(date::DATE) AS year,
      origin, 'NGU' AS source, ST_Point(lng, lat) AS geom
    FROM read_json('${file}', columns = { id: 'VARCHAR', lng: 'DOUBLE', lat: 'DOUBLE', depthToRock: 'DOUBLE', maxDrilled: 'DOUBLE',
      quickClay: 'VARCHAR', date: 'VARCHAR', origin: 'VARCHAR' })
  ) WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const [c] = await query<{ n: number; rock: number; qc: number }>(`
  SELECT count(*)::INTEGER AS n, count(depthToRock)::INTEGER AS rock,
    count(*) FILTER (WHERE quickClay IN ('Sikker', 'Antatt'))::INTEGER AS qc FROM nadag`);
console.log(`nadag: ${c.n} boreholes, ${c.rock} with depth to rock, ${c.qc} with quick clay found (sure or assumed)`);
