// Builds the address profile (docs/PROFILE.md). Used by GET /api/address/:id/profile, and later by the AI summary.
import { lookupAddress, type Address } from "./address.ts";
import { CATEGORIES, DATA_POINTS, SOURCES, type DataPoint, type Find, type Reading, type Row, type Severity } from "./datapoints.ts";
import { query } from "./db.ts";
import { infoText } from "./texts.ts";
import { PERSPECTIVES } from "./perspectives.ts";
import { rateCategory, rateOverall, ratePerspective, type Factor, type MissingPoint, type Rating, type Scored } from "./rating.ts";

export const PROFILE_VERSION = 1;

type MissingReason = "noCoverage" | "sourceUnavailable" | "notLoaded";

export interface PresentDataPoint extends Reading {
  id: string;
  label: string;
  importance: "critical" | "normal";
  source: string;
}

export interface MissingDataPoint {
  id: string;
  label: string;
  importance: "critical" | "normal";
  source: string;
  reason: MissingReason;
}

export interface Profile {
  version: number;
  address: Address;
  rating: Rating;
  warnings: { severity: Severity; text: string; dataPointId: string; categoryId: string }[];
  categories: {
    id: string;
    name: string;
    weight: number;
    required: boolean;
    rating: Rating;
    dataPoints: PresentDataPoint[];
    missing: MissingDataPoint[];
  }[];
  /** Scores for one kind of use (docs/PROFILE.md -> "Perspectives"). */
  perspectives: { id: string; name: string; question: string; rating: Rating & { factors: Factor[] } }[];
  sources: typeof SOURCES;
}

// Metres need a projected CRS: EPSG:25833 (UTM 33N) covers Oslo + Akershus. Data is stored as lng, lat.
const UTM = (g: string) => `ST_Transform(${g}, 'EPSG:4326', 'EPSG:25833', always_xy := true)`;

async function findRows(table: string, find: Find, lng: number, lat: number): Promise<Row[]> {
  const extra = find.where ? ` AND (${find.where})` : "";
  if (find.kind === "within") {
    return query(`SELECT * EXCLUDE (geom) FROM ${table} WHERE ST_Intersects(geom, ST_Point($1, $2))${extra} LIMIT 50`, [lng, lat]);
  }
  const r = find.kind === "nearest" ? find.maxM : find.radiusM;
  // Cheap bbox prefilter in degrees, then exact distance in metres.
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.cos((lat * Math.PI) / 180));
  const near = `
    SELECT * EXCLUDE (geom), ST_Distance(${UTM("geom")}, ${UTM("ST_Point($1, $2)")}) AS distanceM FROM ${table}
    WHERE ST_Intersects(geom, ST_MakeEnvelope($3, $4, $5, $6))${extra}`;
  const params = [lng, lat, lng - dLng, lat - dLat, lng + dLng, lat + dLat, r];
  if (find.kind === "nearest") {
    return query(`SELECT * FROM (${near}) WHERE distanceM <= $7 ORDER BY distanceM LIMIT 1`, params);
  }
  return query(`SELECT * FROM (${near}) WHERE distanceM <= $7 ORDER BY distanceM LIMIT 500`, params);
}

/** Is the point inside an area the source has mapped? undefined when the coverage table isn't loaded. */
async function isMapped(table: string, loaded: Set<string>, lng: number, lat: number): Promise<boolean | undefined> {
  if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`bad coverage table name: ${table}`);
  if (!loaded.has(table)) return undefined;
  const rows = await query(`SELECT 1 FROM ${table} WHERE ST_Intersects(geom, ST_Point($1, $2)) LIMIT 1`, [lng, lat]);
  return rows.length > 0;
}

export async function buildProfile(id: string): Promise<Profile> {
  const address = await lookupAddress(id);
  const loaded = new Set((await query<{ t: string }>("SELECT table_name AS t FROM duckdb_tables()")).map((r) => r.t));

  const results: { dp: DataPoint; reading?: Reading; reason?: MissingReason }[] = [];
  for (const dp of DATA_POINTS) {
    if (!/^[a-z0-9_]+$/.test(dp.table)) throw new Error(`bad table name in data point ${dp.id}: ${dp.table}`);
    if (!loaded.has(dp.table)) {
      results.push({ dp, reason: "notLoaded" });
      continue;
    }
    try {
      const mapped = dp.coverage ? await isMapped(dp.coverage, loaded, address.lng, address.lat) : undefined;
      const reading = dp.read(await findRows(dp.table, dp.find, address.lng, address.lat), address, mapped);
      results.push(reading ? { dp, reading } : { dp, reason: "noCoverage" });
    } catch (err) {
      // A broken entry must not break the whole profile. Show it as missing and log why.
      console.error(`data point ${dp.id} (${dp.table}) failed:`, err);
      results.push({ dp, reason: "sourceUnavailable" });
    }
  }

  const categories = CATEGORIES.map((category) => {
    const mine = results.filter((r) => r.dp.category === category.id);
    const dataPoints: PresentDataPoint[] = [];
    const missing: MissingDataPoint[] = [];
    for (const { dp, reading, reason } of mine) {
      const base = { id: dp.id, label: dp.label, importance: dp.importance, source: dp.source };
      if (reading) {
        // explanation = the info text (docs/TEXTS.md: main text + matching "Når ..." texts), then anything read() adds.
        const explanation = [infoText(dp.id, reading), reading.explanation].filter(Boolean).join(" ");
        dataPoints.push({ ...base, ...reading, ...(explanation && { explanation }) });
      }
      else missing.push({ ...base, reason: reason! });
    }
    const present: Scored[] = mine.filter((r) => r.reading).map((r) => ({ id: r.dp.id, label: r.dp.label, importance: r.dp.importance, reading: r.reading! }));
    const missingPoints: MissingPoint[] = missing.map(({ id, label, importance }) => ({ id, label, importance }));
    return { category, present, rating: rateCategory(present, missingPoints), dataPoints, missing };
  });

  const order: Severity[] = ["high", "medium", "low"];
  const warnings = categories
    .flatMap((c) => c.dataPoints.filter((p) => p.warning).map((p) => ({ ...p.warning!, dataPointId: p.id, categoryId: c.category.id })))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  const perspectives = PERSPECTIVES.map((p) => {
    const mine = results.filter((r) => p.weights[r.dp.id]);
    const points = mine.filter((r) => r.reading).map((r) => ({
      point: { id: r.dp.id, label: r.dp.label, importance: r.dp.importance, reading: r.reading! },
      weight: p.weights[r.dp.id],
    }));
    const missing = mine.filter((r) => !r.reading).map((r) => ({ id: r.dp.id, label: r.dp.label, importance: r.dp.importance, required: p.required.includes(r.dp.id) }));
    return { id: p.id, name: p.name, question: p.question, rating: ratePerspective(points, missing) };
  });

  const usedSources = new Set(["geonorge-adresser", ...DATA_POINTS.map((d) => d.source)]);

  return {
    version: PROFILE_VERSION,
    address,
    rating: rateOverall(categories),
    warnings,
    categories: categories.map((c) => ({
      id: c.category.id,
      name: c.category.name,
      weight: c.category.weight,
      required: c.category.required,
      rating: c.rating,
      dataPoints: c.dataPoints,
      missing: c.missing,
    })),
    perspectives,
    sources: SOURCES.filter((s) => usedSources.has(s.id)),
  };
}
