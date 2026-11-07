// Everyday services from OpenStreetMap for Oslo + Akershus: grocery stores, pharmacies and doctors' offices.
// Licence ODbL, credit "© OpenStreetMap contributors". Owner: Sverre. Needs the `kommuner` table.
// Source: Overpass API (keyless), points and building outlines (as their centre point).
// kind:
//   'dagligvare' shop=supermarket, plus shop=convenience except kiosk chains (7-Eleven, Narvesen, ...): a real grocery store.
//   'apotek'     amenity=pharmacy.
//   'lege'       amenity=doctors or healthcare=doctor, general practice or no speciality given (GP / legekontor);
//                specialist-only practices and clinics are left out.
// OSM is volunteer data: very good for shops and pharmacies in Oslo + Akershus, a bit thinner for doctors.
//
// Overpass servers are often busy, so this script must never stop `npm run ingest` (or the Docker image build):
//   1. Up to ROUNDS rounds over several public Overpass servers, with a time limit per request and a pause between
//      rounds. An answer only counts if it is complete: Overpass can answer "200 OK" with a "runtime error" remark and
//      half the data when it times out, and that would silently drop shops.
//   2. Every good answer is saved (data/raw/tjenester_overpass.json). If all servers fail, the last good answer is used.
//   3. If there is no good answer at all, the script warns and stops without touching the table: an existing
//      `tjenester` table is kept; with none, the three data points show as missing ("not loaded"), never as "no shop".
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { conn, query, tableExists } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const ROUNDS = 3;
const TIMEOUT_MS = 240_000; // the query itself allows 180 s on the server
const PAUSE_MS = 30_000; // between rounds: 30 s, then 60 s
const MIN_ELEMENTS = 1000; // a full answer has ~1 800 objects; far fewer means a cut-off answer
const LAST_GOOD = rawPath("tjenester_overpass.json");
const KIOSK_BRANDS = ["7-Eleven", "Narvesen", "Mix", "Deli de Luca", "Circle K", "Esso", "Shell", "YX", "Uno-X"];

const [minLng, minLat, maxLng, maxLat] = await studyBbox();
const b = `(${minLat},${minLng},${maxLat},${maxLng})`;
const overpassQuery = `[out:json][timeout:180];(
  nwr["shop"~"^(supermarket|convenience)$"]${b};
  nwr["amenity"="pharmacy"]${b};
  nwr["amenity"="doctors"]${b};
  nwr["healthcare"="doctor"]${b};
);out tags center;`;

/** Throws unless the answer is a complete Overpass result. */
function checkComplete(json: any): void {
  if (!Array.isArray(json?.elements)) throw new Error("no elements in the answer");
  if (typeof json.remark === "string" && /error|timed out|out of memory/i.test(json.remark)) {
    throw new Error(`incomplete answer: ${json.remark.slice(0, 120)}`);
  }
  if (json.elements.length < MIN_ELEMENTS) throw new Error(`only ${json.elements.length} objects, expected ${MIN_ELEMENTS}+`);
}

/** A complete answer from one of the servers, or null when every try failed. */
async function overpass(): Promise<any | null> {
  for (let round = 1; round <= ROUNDS; round++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": "GeoMap-hackathon", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: overpassQuery }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        checkComplete(json);
        return json;
      } catch (err) {
        console.warn(`  overpass round ${round}/${ROUNDS}, ${new URL(url).host}: ${(err as Error).message}`);
      }
    }
    if (round < ROUNDS) await new Promise((r) => setTimeout(r, PAUSE_MS * round));
  }
  return null;
}

/** Fresh answer (saved as the new last good one), else the last good one, else null. */
async function loadData(): Promise<any | null> {
  const fresh = await overpass();
  if (fresh) {
    await writeFile(LAST_GOOD, JSON.stringify(fresh));
    return fresh;
  }
  if (existsSync(LAST_GOOD)) {
    const days = Math.round((Date.now() - statSync(LAST_GOOD).mtimeMs) / 86_400_000);
    console.warn(`  tjenester: every Overpass server failed; using the last good download (${days} days old)`);
    const cached = JSON.parse(await readFile(LAST_GOOD, "utf8"));
    checkComplete(cached);
    return cached;
  }
  return null;
}

function kindOf(t: Record<string, string>): string | null {
  if (t.shop === "supermarket") return "dagligvare";
  if (t.shop === "convenience") {
    const brand = t.brand ?? t.name ?? "";
    return KIOSK_BRANDS.some((k) => brand.toLowerCase().startsWith(k.toLowerCase())) ? null : "dagligvare";
  }
  if (t.amenity === "pharmacy" || t.healthcare === "pharmacy") return "apotek";
  if (t.amenity === "doctors" || t.healthcare === "doctor") {
    const spec = t["healthcare:speciality"];
    return !spec || spec.split(";").includes("general") ? "lege" : null;
  }
  return null;
}

const data = await loadData();
if (!data) {
  const kept = await tableExists("tjenester");
  console.warn(
    `  tjenester: SKIPPED, no Overpass server answered and there is no earlier download. ` +
      (kept ? "The existing tjenester table is kept." : "groceryStore, pharmacy and doctor will show as missing (not loaded)."),
  );
} else {
  await build(data);
}

async function build(data: any): Promise<void> {
  const features = [];
  for (const e of data.elements as any[]) {
    const t = e.tags ?? {};
    const kind = kindOf(t);
    const lon = e.lon ?? e.center?.lon;
    const lat = e.lat ?? e.center?.lat;
    if (!kind || lon == null || lat == null) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { osmId: `${e.type}/${e.id}`, kind, name: t.name ?? t.brand ?? null, brand: t.brand ?? null },
    });
  }
  const file = rawPath("tjenester.geojson");
  await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));

  // One row per OSM object. A shop mapped both as a point and as a building is rare; both rows are kept.
  await conn.run(`
    CREATE OR REPLACE TABLE tjenester AS
    SELECT osmId AS id, kind,
      coalesce(name, CASE kind WHEN 'dagligvare' THEN 'Dagligvarebutikk' WHEN 'apotek' THEN 'Apotek' ELSE 'Legekontor' END) AS name,
      brand, 'OpenStreetMap' AS source, geom
    FROM ST_Read('${file}')
    WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
  `);
  const counts = await query<{ kind: string; n: number }>("SELECT kind, count(*)::INTEGER AS n FROM tjenester GROUP BY 1 ORDER BY 1");
  console.log(`tjenester: ${counts.map((c) => `${c.kind}=${c.n}`).join(", ")} (${data.elements.length} OSM objects fetched)`);
}
