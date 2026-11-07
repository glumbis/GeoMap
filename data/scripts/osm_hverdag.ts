// Everyday places and cycleways from OpenStreetMap for Oslo + Akershus. Licence ODbL, credit
// "© OpenStreetMap contributors". Owner: Even. Needs the `kommuner` table. Overpass API (keyless).
// Same safety rules as tjenester.ts: complete answers only, the last good answer is saved and reused,
// and a failure never stops `npm run ingest` (an existing table is kept).
//
// Table `hverdag` (points; outlines as their centre), kind:
//   'sykehus'    amenity=hospital or healthcare=hospital
//   'legevakt'   anything named "...legevakt" (amenity=clinic / doctors / healthcare)
//   'lading'     amenity=charging_station (EV charging)
//   'bibliotek'  amenity=library
//   'servering'  amenity=cafe | restaurant | bar | pub
// Table `sykkelveier` (lines): highway=cycleway (separate cycle paths, incl. gang- og sykkelvei tagged as cycleway).
// Data points in api/src/datapoints.ts: hospital, emergencyClinic, evCharging, library, cafes, cycleway (info only).
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { conn, query, tableExists } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const [minLng, minLat, maxLng, maxLat] = await studyBbox();
const b = `(${minLat},${minLng},${maxLat},${maxLng})`;

function complete(json: any, min: number): boolean {
  return Array.isArray(json?.elements) && !/error|timed out|out of memory/i.test(String(json.remark ?? "")) && json.elements.length >= min;
}

/** A complete Overpass answer (saved under `cache`), else the last saved one, else null. */
async function overpass(q: string, min: number, cache: string): Promise<any | null> {
  for (let round = 1; round <= 3; round++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": "GeoMap-hackathon", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: q }),
          signal: AbortSignal.timeout(300_000),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        if (!complete(json, min)) throw new Error(`incomplete answer (${json?.elements?.length ?? 0} objects)`);
        await writeFile(rawPath(cache), JSON.stringify(json));
        return json;
      } catch (err) {
        console.warn(`  overpass round ${round}/3, ${new URL(url).host}: ${(err as Error).message}`);
      }
    }
    if (round < 3) await new Promise((r) => setTimeout(r, 30_000 * round));
  }
  if (existsSync(rawPath(cache))) {
    console.warn(`  every Overpass server failed; using the last good download (${cache})`);
    return JSON.parse(await readFile(rawPath(cache), "utf8"));
  }
  return null;
}

// ---- Points ----
const places = await overpass(
  `[out:json][timeout:240];(
    nwr["amenity"="hospital"]${b}; nwr["healthcare"="hospital"]${b};
    nwr["name"~"[Ll]egevakt"]${b};
    nwr["amenity"="charging_station"]${b};
    nwr["amenity"="library"]${b};
    nwr["amenity"~"^(cafe|restaurant|bar|pub)$"]${b};
  );out tags center;`,
  3000,
  "hverdag_overpass.json",
);

function kindOf(t: Record<string, string>): string | null {
  if (/legevakt/i.test(t.name ?? "")) return "legevakt";
  if (t.amenity === "hospital" || t.healthcare === "hospital") return "sykehus";
  if (t.amenity === "charging_station") return "lading";
  if (t.amenity === "library") return "bibliotek";
  if (["cafe", "restaurant", "bar", "pub"].includes(t.amenity)) return "servering";
  return null;
}
const FALLBACK: Record<string, string> = { sykehus: "Sykehus", legevakt: "Legevakt", lading: "Ladestasjon", bibliotek: "Bibliotek", servering: "Servering" };

if (!places) {
  console.warn(`  hverdag: SKIPPED, no Overpass answer.${(await tableExists("hverdag")) ? " The existing table is kept." : ""}`);
} else {
  const rows = [];
  for (const e of places.elements as any[]) {
    const t = e.tags ?? {};
    const kind = kindOf(t);
    const lng = e.lon ?? e.center?.lon;
    const lat = e.lat ?? e.center?.lat;
    if (!kind || lng == null || lat == null) continue;
    rows.push({
      id: `${e.type}/${e.id}`, kind, name: t.name ?? t.operator ?? t.brand ?? FALLBACK[kind],
      sub: t.amenity ?? null, sockets: Number(t.capacity ?? t.sockets) || null, lng, lat,
    });
  }
  const file = rawPath("hverdag.json");
  await writeFile(file, JSON.stringify(rows));
  // One row per OSM object. sub = OSM amenity (cafe, restaurant, ...); sockets = charging points when tagged.
  await conn.run(`
    CREATE OR REPLACE TABLE hverdag AS
    SELECT * FROM (
      SELECT id, kind, name, sub, sockets, 'OpenStreetMap' AS source, ST_Point(lng, lat) AS geom
      FROM read_json('${file}', columns = { id: 'VARCHAR', kind: 'VARCHAR', name: 'VARCHAR', sub: 'VARCHAR', sockets: 'INTEGER', lng: 'DOUBLE', lat: 'DOUBLE' })
    ) WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  `);
  const counts = await query<{ kind: string; n: number }>("SELECT kind, count(*)::INTEGER AS n FROM hverdag GROUP BY 1 ORDER BY 1");
  console.log(`hverdag: ${counts.map((c) => `${c.kind} ${c.n}`).join(", ")}`);
}

// ---- Cycleways (lines) ----
const ways = await overpass(`[out:json][timeout:240];way["highway"="cycleway"]${b};out tags geom;`, 2000, "sykkelveier_overpass.json");
if (!ways) {
  console.warn(`  sykkelveier: SKIPPED, no Overpass answer.${(await tableExists("sykkelveier")) ? " The existing table is kept." : ""}`);
} else {
  const rows = (ways.elements as any[])
    .filter((e) => e.type === "way" && e.geometry?.length >= 2)
    .map((e) => ({
      id: `way/${e.id}`, name: e.tags?.name ?? null, foot: e.tags?.foot ?? null,
      wkt: `LINESTRING(${e.geometry.map((p: any) => `${p.lon} ${p.lat}`).join(",")})`,
    }));
  const file = rawPath("sykkelveier.json");
  await writeFile(file, JSON.stringify(rows));
  // One row per OSM way. shared = also open to walkers (gang- og sykkelvei).
  await conn.run(`
    CREATE OR REPLACE TABLE sykkelveier AS
    SELECT * FROM (
      SELECT id, coalesce(name, 'Sykkelvei') AS name, foot IN ('yes', 'designated') AS shared, 'OpenStreetMap' AS source,
        ST_GeomFromText(wkt) AS geom
      FROM read_json('${file}', columns = { id: 'VARCHAR', name: 'VARCHAR', foot: 'VARCHAR', wkt: 'VARCHAR' })
    ) WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  `);
  const [c] = await query<{ n: number; km: number }>(
    "SELECT count(*)::INTEGER AS n, round(sum(ST_Length(ST_Transform(geom, 'EPSG:4326', 'EPSG:25833', always_xy := true))) / 1000)::INTEGER AS km FROM sykkelveier",
  );
  console.log(`sykkelveier: ${c.n} ways, ${c.km} km`);
}
