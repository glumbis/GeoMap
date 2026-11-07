// Public transport stops (all operators: bus, metro, tram, train, boat) in Oslo + Akershus,
// from Entur's Journey Planner API (NLOD, keyless). Owner: Even. Needs the `kommuner` table.
// One row per stop place (a station or a stop, possibly with several platforms/quays).
//
// Departures: counted from Entur's GTFS timetables (Ruter, Vy, Flytoget) for one normal weekday:
// the next Tuesday after the ingest date (stored in `departuresDate`). A departure = a trip that stops
// there and lets people board. `lines` = distinct routes. Stops with no departures that day (or not in
// these three timetables, e.g. other operators' coaches) have NULL, never a made-up 0.
// The timetables split some stops by mode (Frognerseteren bus + metro); Entur's API gives the combined
// "parent" stop, so children are mapped to their parent before counting.
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, open, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";
import { conn, query } from "../../api/src/db.ts";
import { download, rawPath } from "./lib.ts";

const ENTUR = "https://api.entur.io/journey-planner/v3/graphql";
const GTFS = "https://storage.googleapis.com/marduk-production/outbound/gtfs";
const FEEDS = ["rb_rut", "rb_vyg", "rb_flt"]; // Ruter (bus, metro, tram, boat), Vy (trains, buses), Flytoget
const GTFS_FILES = ["stops.txt", "trips.txt", "calendar_dates.txt", "stop_times.txt"];

const [ext] = await query<{ minLng: number; minLat: number; maxLng: number; maxLat: number }>(`
  SELECT ST_XMin(g) AS minLng, ST_YMin(g) AS minLat, ST_XMax(g) AS maxLng, ST_YMax(g) AS maxLat
  FROM (SELECT ST_Extent_Agg(geom) AS g FROM kommuner)
`);
if (!ext?.minLng) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

async function entur(fields: string, mode: "parent" | "child") {
  const gql = `{ stopPlacesByBbox(
    minimumLatitude: ${ext.minLat}, minimumLongitude: ${ext.minLng},
    maximumLatitude: ${ext.maxLat}, maximumLongitude: ${ext.maxLng}, multiModalMode: ${mode}
  ) { ${fields} } }`;
  const res = await fetch(ENTUR, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ET-Client-Name": "geomap-hackathon" },
    body: JSON.stringify({ query: gql }),
  });
  if (!res.ok) throw new Error(`Entur: ${res.status} ${await res.text()}`);
  const js = await res.json();
  if (js.errors) throw new Error(`Entur: ${JSON.stringify(js.errors)}`);
  return js.data.stopPlacesByBbox as any[];
}

type Stop = { id: string; name: string; latitude: number; longitude: number; transportMode: string[]; quays: unknown[] };
const stops = ((await entur("id name latitude longitude transportMode quays { id }", "parent")) as Stop[]).map((s) => {
  const modes = [...new Set(s.transportMode ?? [])].sort();
  return {
    id: s.id,
    name: s.name,
    lng: s.longitude,
    lat: s.latitude,
    modes: modes.join(","), // e.g. "bus,rail"
    hasBus: modes.includes("bus"),
    hasTram: modes.includes("tram"),
    hasMetro: modes.includes("metro"),
    hasRail: modes.includes("rail"),
    hasWater: modes.includes("water"),
    quays: s.quays?.length ?? 0,
  };
});
const file = rawPath("stops.json");
await writeFile(file, JSON.stringify(stops));

// child stop place -> combined parent, e.g. NSR:StopPlace:6579 (Frognerseteren T) -> NSR:StopPlace:59768
const children = (await entur("id parent { id }", "child")).filter((c) => c.parent?.id);
const parentsFile = rawPath("stops_parents.json");
await writeFile(parentsFile, JSON.stringify(children.map((c) => ({ child: c.id, parent: c.parent.id }))));

/** Extract some files from a zip with Node's zlib only (no dependency). Skips files already extracted. */
async function unzip(zipPath: string, names: string[], outDir: string) {
  const fh = await open(zipPath, "r");
  try {
    const { size } = await fh.stat();
    const tail = Buffer.alloc(Math.min(size, 65_557));
    await fh.read(tail, 0, tail.length, size - tail.length);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error(`not a zip: ${zipPath}`);
    const cdSize = tail.readUInt32LE(eocd + 12), cdOffset = tail.readUInt32LE(eocd + 16);
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    for (let p = 0; p < cdSize; ) {
      const method = cd.readUInt16LE(p + 10), compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      const out = `${outDir}/${name}`;
      if (!names.includes(name) || existsSync(out)) continue;
      const local = Buffer.alloc(30);
      await fh.read(local, 0, 30, localOffset);
      const start = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const src = createReadStream(zipPath, { start, end: start + compSize - 1 });
      if (method === 8) await pipeline(src, createInflateRaw(), createWriteStream(out));
      else if (method === 0) await pipeline(src, createWriteStream(out));
      else throw new Error(`zip method ${method} not supported (${name})`);
    }
  } finally {
    await fh.close();
  }
}

// The next Tuesday after today: a normal weekday inside every feed's period.
const day = new Date();
do day.setDate(day.getDate() + 1); while (day.getDay() !== 2);
const ymd = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;

const counts: string[] = [];
for (const feed of FEEDS) {
  const zip = await download(`${GTFS}/${feed}-aggregated-gtfs.zip`, `gtfs_${feed}.zip`);
  const dir = rawPath(`gtfs_${feed}`);
  await mkdir(dir, { recursive: true });
  await unzip(zip, GTFS_FILES, dir);
  counts.push(`
    SELECT coalesce(nullif(q.parent_station, ''), q.stop_id) AS place, t.route_id, '${feed}' AS feed
    FROM read_csv('${dir}/stop_times.txt', all_varchar = true) st
    JOIN read_csv('${dir}/trips.txt', all_varchar = true) t USING (trip_id)
    JOIN read_csv('${dir}/stops.txt', all_varchar = true) q USING (stop_id)
    WHERE coalesce(st.pickup_type, '0') <> '1'
      AND t.service_id IN (SELECT service_id FROM read_csv('${dir}/calendar_dates.txt', all_varchar = true)
                           WHERE date = '${ymd}' AND exception_type = '1')`);
}

await conn.run(`
  CREATE OR REPLACE TABLE stops AS
  WITH s AS (
    SELECT * EXCLUDE (lng, lat, quays), quays::INTEGER AS quays, ST_Point(lng, lat) AS geom
    FROM read_json_auto('${file}')
  ),
  parents AS (SELECT child, parent FROM read_json_auto('${parentsFile}')),
  calls AS (${counts.join(" UNION ALL ")}),
  dep AS (
    SELECT coalesce(p.parent, c.place) AS id, count(*)::INTEGER AS departures,
           count(DISTINCT c.feed || c.route_id)::INTEGER AS lines
    FROM calls c LEFT JOIN parents p ON p.child = c.place
    GROUP BY 1
  )
  SELECT s.* EXCLUDE (geom), d.departures, d.lines,
         CASE WHEN d.id IS NOT NULL THEN strptime('${ymd}', '%Y%m%d')::DATE END AS departuresDate,
         k.kommunenummer, 'Entur' AS source, s.geom
  FROM s
  JOIN kommuner k ON ST_Intersects(s.geom, k.geom)
  LEFT JOIN dep d ON d.id = s.id
`);
const [r] = await query<{ n: number; withDep: number }>(
  "SELECT count(*)::INTEGER AS n, count(departures)::INTEGER AS withDep FROM stops",
);
console.log(`stops: ${r.n} rows (of ${stops.length} in the bounding box), ${r.withDep} with departures on ${ymd}`);
