// Everyday services from OpenStreetMap for Oslo + Akershus: grocery stores, pharmacies and doctors' offices.
// Licence ODbL, credit "© OpenStreetMap contributors". Owner: Sverre. Needs the `kommuner` table.
// Source: Overpass API (keyless), points and building outlines (as their centre point).
// kind:
//   'dagligvare' shop=supermarket, plus shop=convenience except kiosk chains (7-Eleven, Narvesen, ...): a real grocery store.
//   'apotek'     amenity=pharmacy.
//   'lege'       amenity=doctors or healthcare=doctor, general practice or no speciality given (GP / legekontor);
//                specialist-only practices and clinics are left out.
// OSM is volunteer data: very good for shops and pharmacies in Oslo + Akershus, a bit thinner for doctors.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const KIOSK_BRANDS = ["7-Eleven", "Narvesen", "Mix", "Deli de Luca", "Circle K", "Esso", "Shell", "YX", "Uno-X"];

const [minLng, minLat, maxLng, maxLat] = await studyBbox();
const b = `(${minLat},${minLng},${maxLat},${maxLng})`;
const overpassQuery = `[out:json][timeout:180];(
  nwr["shop"~"^(supermarket|convenience)$"]${b};
  nwr["amenity"="pharmacy"]${b};
  nwr["amenity"="doctors"]${b};
  nwr["healthcare"="doctor"]${b};
);out tags center;`;

async function overpass(): Promise<any> {
  let last: unknown;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": "GeoMap-hackathon", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: overpassQuery }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      last = err;
      console.warn(`overpass ${url} failed: ${(err as Error).message}`);
    }
  }
  throw last;
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

const data = await overpass();
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
