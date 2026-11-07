// Builds the address profile (docs/PROFILE.md). Used by GET /api/address/:id/profile, and later by the AI summary.
import { lookupAddress, type Address } from "./address.ts";
import { CATEGORIES, DATA_POINTS, SOURCES, type DataPoint, type Find, type Reading, type Row, type Severity } from "./datapoints.ts";
import { query } from "./db.ts";
import { infoText } from "./texts.ts";
import { PERSPECTIVES } from "./perspectives.ts";
import { rateCategory, rateOverall, ratePerspective, type Factor, type MissingPoint, type Rating, type Scored } from "./rating.ts";

export const PROFILE_VERSION = 1;

export type MissingReason = "noCoverage" | "sourceUnavailable" | "notLoaded" | "outsideArea";

/** One data point's outcome for an address: a reading, or why it is missing. */
export type ReadingResult = { dp: DataPoint; reading?: Reading; reason?: MissingReason };

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
  /**
   * Common things to check (radon, awareness areas): not hazard findings, never cap the score.
   * areaShare: how much of the municipality's area has the same finding, in percent, so "like most of Oslo" can be said.
   */
  checks: { text: string; dataPointId: string; categoryId: string; areaShare?: { percent: number; municipality: string } }[];
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

/** How far to look for a hazard zone next to an address that is outside it (DataPoint.near). */
export const NEAR_ZONE_M = 250;

/**
 * Outside every zone: is one close? Sets reading.nearestZone and adds "ca. X m til nærmeste ..." (or "ca. X m unna") to the display.
 * Rounded (5 m under 50 m, else 10 m): zone lines and address points are not more exact than that. Never touches the score.
 */
async function addNearestZone(dp: DataPoint, reading: Reading, lng: number, lat: number): Promise<void> {
  const [row] = await findRows(dp.table, { kind: "nearest", maxM: NEAR_ZONE_M, where: dp.near!.where }, lng, lat);
  if (!row) return;
  const d = Number(row.distanceM);
  const distanceM = Math.max(5, Math.round(d / (d < 50 ? 5 : 10)) * (d < 50 ? 5 : 10));
  const text = dp.near!.text?.(row);
  reading.nearestZone = { distanceM, ...(text && { text }) };
  reading.display = `${reading.display}, ca. ${distanceM} m ${text ? `til nærmeste ${text}` : "unna"}`;
}

const shareCache = new Map<string, Promise<number | undefined>>();

/**
 * Percent of a municipality's area where `table` has a row matching `where` (fixed SQL from DATA_POINTS, never user input).
 * Estimated on a 40 × 40 grid of points over the municipality, so it is cheap; cached per table, filter and municipality.
 */
function areaShare(table: string, where: string, municipalityNumber: string): Promise<number | undefined> {
  const key = `${table}|${where}|${municipalityNumber}`;
  if (!shareCache.has(key)) {
    const run = query<{ total: bigint | number; hit: bigint | number }>(
      `WITH k AS (SELECT geom FROM kommuner WHERE kommunenummer = $1 LIMIT 1),
            b AS (SELECT ST_XMin(geom) x0, ST_YMin(geom) y0, ST_XMax(geom) x1, ST_YMax(geom) y1 FROM k),
            g AS (SELECT row_number() OVER () AS n, ST_Point(x0 + (x1 - x0) * (i + 0.5) / 40, y0 + (y1 - y0) * (j + 0.5) / 40) AS p
                  FROM b, range(40) t(i), range(40) u(j)),
            inside AS (SELECT n, p FROM g, k WHERE ST_Intersects(k.geom, g.p))
       SELECT (SELECT count(*) FROM inside) AS total,
              (SELECT count(DISTINCT inside.n) FROM inside JOIN ${table} r ON ST_Intersects(r.geom, inside.p) WHERE ${where}) AS hit`,
      [municipalityNumber],
    ).then(([r]) => (r && Number(r.total) ? Math.round((Number(r.hit) / Number(r.total)) * 100) : undefined));
    run.catch(() => shareCache.delete(key)); // try again next time
    shareCache.set(key, run);
  }
  return shareCache.get(key)!;
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
  // Study area = the kommuner table (Oslo + Akershus). Outside it no dataset covers the address (docs/PROFILE.md, rule 6).
  const outside = (await isMapped("kommuner", loaded, address.lng, address.lat)) === false;

  const results: ReadingResult[] = [];
  for (const dp of DATA_POINTS) {
    if (!/^[a-z0-9_]+$/.test(dp.table)) throw new Error(`bad table name in data point ${dp.id}: ${dp.table}`);
    if (outside) {
      results.push({ dp, reason: "outsideArea" });
      continue;
    }
    if (!loaded.has(dp.table)) {
      results.push({ dp, reason: "notLoaded" });
      continue;
    }
    try {
      const mapped = dp.coverage ? await isMapped(dp.coverage, loaded, address.lng, address.lat) : undefined;
      const reading = dp.read(await findRows(dp.table, dp.find, address.lng, address.lat), address, mapped);
      if (reading && dp.near && reading.effect === "good") await addNearestZone(dp, reading, address.lng, address.lat);
      results.push(reading ? { dp, reading } : { dp, reason: "noCoverage" });
    } catch (err) {
      // A broken entry must not break the whole profile. Show it as missing and log why.
      console.error(`data point ${dp.id} (${dp.table}) failed:`, err);
      results.push({ dp, reason: "sourceUnavailable" });
    }
  }
  // Area shares need the database, so they are looked up here and handed to assembleProfile (which has no DB access).
  const shares = new Map<string, number>();
  if (!outside) {
    for (const r of results) {
      const w = r.reading?.warning;
      if (!w?.check || !w.sameArea) continue;
      const share = await areaShare(r.dp.table, w.sameArea, address.municipalityNumber).catch(() => undefined);
      if (share != null) shares.set(r.dp.id, share);
    }
  }
  return assembleProfile(address, results, outside, shares);
}

/**
 * Readings -> the full profile (categories, warnings, ratings, perspectives). No database access, so the
 * batch scoring of every address (data/area-scores.ts) uses exactly the same rules as the address page.
 */
export function assembleProfile(address: Address, results: ReadingResult[], outside = false, shares: Map<string, number> = new Map()): Profile {
  // A coarse awareness area is not counted again when the detailed hazard zone for the same hazard already warns.
  for (const r of results) {
    const by = r.dp.supersededBy && results.find((x) => x.dp.id === r.dp.supersededBy);
    if (r.reading && by && by.reading?.warning && !by.reading.warning.check) {
      const { warning: _w, penalty: _p, ...rest } = r.reading;
      r.reading = rest;
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
  const flagged = categories.flatMap((c) => c.dataPoints.filter((p) => p.warning).map((p) => ({ p, categoryId: c.category.id })));
  const warnings = flagged
    .filter(({ p }) => !p.warning!.check)
    .map(({ p, categoryId }) => ({ severity: p.warning!.severity, text: p.warning!.text, dataPointId: p.id, categoryId }))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const checks = [];
  for (const { p, categoryId } of flagged.filter(({ p }) => p.warning!.check)) {
    const share = outside ? undefined : shares.get(p.id);
    checks.push({
      text: p.warning!.text,
      dataPointId: p.id,
      categoryId,
      ...(share != null && { areaShare: { percent: share, municipality: address.municipality } }),
    });
  }
  // sameArea is SQL for the line above, not for clients.
  for (const c of categories) for (const p of c.dataPoints) if (p.warning?.sameArea) p.warning = { ...p.warning, sameArea: undefined };

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
    rating: outside
      ? { ...rateOverall(categories), status: "unavailable", reason: "Adressen ligger utenfor Oslo og Akershus. Vi har bare data for Oslo og Akershus ennå." }
      : rateOverall(categories),
    warnings,
    checks,
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
