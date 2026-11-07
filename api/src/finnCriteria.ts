// Reverse search criteria (GET /api/finn): parse and validate them. Pure, no database: tested in api/test/finn.test.ts.
// - parseQuery(): the URL query params. Strict: a bad value is an error (the route answers 400).
// - sanitizeAi(): the JSON the AI made from free text (GET /api/finn/tolk). Lenient: clamps numbers, drops unknown keys.

export const SCORE_KEYS = ["minScore", "minLiving", "minBuilding", "minFamily", "minCommuter"] as const;
export const DISTANCE_KEYS = ["maxSchoolM", "maxKindergartenM", "maxGroceryM", "maxTransitStopM", "maxTrailsM", "maxDoctorM"] as const;
export const FLAG_KEYS = ["noHazard", "quiet"] as const;

type ScoreKey = (typeof SCORE_KEYS)[number];
type DistanceKey = (typeof DISTANCE_KEYS)[number];
type FlagKey = (typeof FLAG_KEYS)[number];

export type Criteria = Partial<Record<ScoreKey | DistanceKey, number> & Record<FlagKey, true>> & {
  minTransitDepartures?: number;
  /** Municipality name (e.g. "Bærum") or number (e.g. "3201"). */
  kommune?: string;
};

export const SCORE_RANGE = [0, 100] as const;
export const DISTANCE_RANGE = [100, 10_000] as const;
export const DEPARTURES_RANGE = [0, 10_000] as const;
export const LIMIT_DEFAULT = 5000;
export const LIMIT_MAX = 10_000;

/** Table column each criterion reads, and how it compares. NULL never matches (unknown is not "fits"). */
export const CRITERIA_SQL: Record<Exclude<keyof Criteria, "kommune">, string> = {
  minScore: "score >= ?", minLiving: "living >= ?", minBuilding: "building >= ?", minFamily: "family >= ?", minCommuter: "commuter >= ?",
  maxSchoolM: "schoolM <= ?", maxKindergartenM: "kindergartenM <= ?", maxGroceryM: "groceryM <= ?",
  maxTransitStopM: "transitStopM <= ?", maxTrailsM: "trailsM <= ?", maxDoctorM: "doctorM <= ?",
  minTransitDepartures: "transitDepartures >= ?",
  noHazard: "hazard = false", quiet: "quiet = true",
};

const KOMMUNE = /^[\p{L}\d][\p{L}\d .-]{0,59}$/u;

export class CriteriaError extends Error {}

function strictNumber(key: string, raw: string, [lo, hi]: readonly [number, number]): number {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) throw new CriteriaError(`${key} must be a number`);
  if (n < lo || n > hi) throw new CriteriaError(`${key} must be between ${lo} and ${hi}`);
  return Math.round(n);
}

function strictFlag(key: string, raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "ja"].includes(v)) return true;
  if (["0", "false", "no", "nei", ""].includes(v)) return false;
  throw new CriteriaError(`${key} must be 1 or 0`);
}

/** URL query -> criteria. Throws CriteriaError on bad input. Empty params are ignored. */
export function parseQuery(q: Record<string, string | undefined>): Criteria {
  const c: Criteria = {};
  const given = (k: string) => q[k] != null && q[k]!.trim() !== "";
  for (const k of SCORE_KEYS) if (given(k)) c[k] = strictNumber(k, q[k]!, SCORE_RANGE);
  for (const k of DISTANCE_KEYS) if (given(k)) c[k] = strictNumber(k, q[k]!, DISTANCE_RANGE);
  if (given("minTransitDepartures")) c.minTransitDepartures = strictNumber("minTransitDepartures", q.minTransitDepartures!, DEPARTURES_RANGE);
  for (const k of FLAG_KEYS) if (given(k) && strictFlag(k, q[k]!)) c[k] = true;
  if (given("kommune")) {
    const k = q.kommune!.trim();
    if (!KOMMUNE.test(k)) throw new CriteriaError("kommune must be a municipality name or number");
    c.kommune = k;
  }
  return c;
}

/** bbox=minLng,minLat,maxLng,maxLat -> numbers, or undefined. Throws CriteriaError on bad input. */
export function parseBbox(raw: string | undefined): [number, number, number, number] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const b = raw.split(",").map(Number);
  if (b.length !== 4 || b.some((n) => !Number.isFinite(n)) || b[0] >= b[2] || b[1] >= b[3]) {
    throw new CriteriaError("bbox must be minLng,minLat,maxLng,maxLat");
  }
  return b as [number, number, number, number];
}

export function parseLimit(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new CriteriaError(`limit must be a whole number from 1 to ${LIMIT_MAX}`);
  return Math.min(n, LIMIT_MAX);
}

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.round(Math.min(hi, Math.max(lo, n)));

function looseNumber(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * AI output -> criteria. Keeps known keys only, clamps numbers into range, turns flags into true or drops them.
 * kommune is kept only if it matches one of `kommuner` (names or numbers, case-insensitive); it is returned as written there.
 */
export function sanitizeAi(raw: unknown, kommuner: string[] = []): Criteria {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const c: Criteria = {};
  for (const k of SCORE_KEYS) { const n = looseNumber(o[k]); if (n != null) c[k] = clamp(n, SCORE_RANGE); }
  for (const k of DISTANCE_KEYS) { const n = looseNumber(o[k]); if (n != null) c[k] = clamp(n, DISTANCE_RANGE); }
  const d = looseNumber(o.minTransitDepartures);
  if (d != null) c.minTransitDepartures = clamp(d, DEPARTURES_RANGE);
  for (const k of FLAG_KEYS) if (o[k] === true || o[k] === 1 || o[k] === "true" || o[k] === "1") c[k] = true;
  if (typeof o.kommune === "string" && o.kommune.trim()) {
    const want = o.kommune.trim().toLowerCase();
    const hit = kommuner.find((k) => k.toLowerCase() === want);
    if (hit) c.kommune = hit;
  }
  return c;
}

/** WHERE parts and params for the criteria (DuckDB $n params, numbered from `start`). */
export function criteriaWhere(c: Criteria, start = 1): { where: string[]; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  for (const [key, sql] of Object.entries(CRITERIA_SQL) as [keyof typeof CRITERIA_SQL, string][]) {
    const v = c[key];
    if (v == null) continue;
    if (sql.includes("?")) {
      params.push(v as number);
      where.push(sql.replace("?", `$${start + params.length - 1}`));
    } else where.push(sql);
  }
  if (c.kommune) {
    params.push(c.kommune);
    const p = `$${start + params.length - 1}`;
    where.push(`(kommunenummer = ${p} OR lower(kommune) = lower(${p}))`);
  }
  return { where, params };
}
