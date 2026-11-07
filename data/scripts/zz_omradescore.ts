// Area score map: Oslo + Akershus in 500 m squares, each with the same 0–100 overall score an address gets
// (same DATA_POINTS; the profile itself is built by assembleProfile() from api/src/profile.ts, so superseded
// awareness areas, penalties and caps follow exactly the address page's rules), worked out at the square's centre point.
// Owner: Erik. Needs every other table, so the file name starts with "zz" to run last in `npm run ingest`.
// Only squares where people live (centre in a grunnkrets with at least MIN_PER_KM2 people per km²) are scored.
// Each square also stores the four perspective scores and raw values (hazard, road noise, distances, departures)
// that GET /api/finn (reverse search) filters on. All nullable: NULL = we don't have the data, never a fake 0.
// A square whose overall status isn't "ok" keeps a NULL score (never guessed) but stays, so it can match other criteria.
// Fast because each data point runs as ONE query for all squares (a spatial join), not one query per square.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { DATA_POINTS, type Find, type Reading, type Row } from "../../api/src/datapoints.ts";
import { assembleProfile, type MissingReason, type ReadingResult } from "../../api/src/profile.ts";
import type { Address } from "../../api/src/address.ts";
import { rawPath } from "./lib.ts";

const SIZE = 500; // metres
const MIN_PER_KM2 = 25;
const UTM = (g: string) => `ST_Transform(${g}, 'EPSG:4326', 'EPSG:25833', always_xy := true)`;

const loaded = new Set((await query<{ t: string }>("SELECT table_name AS t FROM duckdb_tables()")).map((r) => r.t));
for (const t of ["kommuner", "grunnkretser"]) if (!loaded.has(t)) throw new Error(`${t} table is missing. Run: npm run ingest ${t}`);

// ---------- Squares ----------
// The grid follows longitude/latitude lines, so the squares sit straight on the web map (a UTM 33 grid is turned
// ~3.7° here, because Oslo lies west of UTM 33's central meridian). Cell size: SIZE metres north–south, and SIZE
// metres east–west at MID_LAT (59.9°); across Oslo + Akershus (59.4°–60.6°) the width varies by under 3 %.
const MID_LAT = 59.9;
const D_LAT = SIZE / 111_320;
const D_LNG = SIZE / (111_320 * Math.cos((MID_LAT * Math.PI) / 180));
const [b] = await query<{ minx: number; miny: number; maxx: number; maxy: number }>(`
  SELECT min(ST_XMin(geom)) AS minx, min(ST_YMin(geom)) AS miny, max(ST_XMax(geom)) AS maxx, max(ST_YMax(geom)) AS maxy
  FROM kommuner`);
const [i0, j0] = [Math.floor(b.minx / D_LNG), Math.floor(b.miny / D_LAT)];
const [i1, j1] = [Math.ceil(b.maxx / D_LNG), Math.ceil(b.maxy / D_LAT)];

await conn.run(`
  CREATE OR REPLACE TEMP TABLE sq AS
  WITH c AS (
    SELECT i * ${D_LNG} AS x, j * ${D_LAT} AS y, ST_Point((i + 0.5) * ${D_LNG}, (j + 0.5) * ${D_LAT}) AS geom
    FROM range(${i0}, ${i1}) ti(i), range(${j0}, ${j1}) tj(j)
  )
  SELECT row_number() OVER (ORDER BY c.x, c.y)::INTEGER AS cid, c.x, c.y, ST_X(c.geom) AS lng, ST_Y(c.geom) AS lat, c.geom,
    any_value(k.kommunenummer) AS kommunenummer, any_value(k.name) AS kommune,
    -- Place names for the hit list: the grunnkrets the centre lies in, and in Oslo its bydel.
    -- Grunnkrets names often end in a serial number ("Bærums verk 01"): drop it, people don't say it.
    any_value(nullif(trim(regexp_replace(g.name, '\\s+\\d+$', '')), '')) AS place
    ${loaded.has("oslo_bydeler") ? ", any_value(bd.name) AS bydel" : ", NULL::VARCHAR AS bydel"}
  FROM c
  JOIN kommuner k ON ST_Intersects(k.geom, c.geom)
  JOIN grunnkretser g ON ST_Intersects(g.geom, c.geom) AND g.population > 0 AND g.perKm2 >= ${MIN_PER_KM2}
  ${loaded.has("oslo_bydeler") ? "LEFT JOIN oslo_bydeler bd ON ST_Intersects(bd.geom, c.geom)" : ""}
  GROUP BY c.x, c.y, c.geom`);
const squares = await query<{ cid: number; lng: number; lat: number; kommunenummer: string; kommune: string }>(
  "SELECT cid, lng, lat, kommunenummer, kommune FROM sq ORDER BY cid",
);
console.log(`omradescore: ${squares.length} squares of ${SIZE} m where people live`);
const OSLO = "0301";

// ---------- One query per data point, for all squares ----------
async function rows(sql: string): Promise<Row[]> {
  return (await conn.runAndReadAll(sql)).getRowObjectsJson() as Row[];
}

/** Rows per square, like findRows() in api/src/profile.ts but for every square at once. */
async function findAll(table: string, find: Find): Promise<Map<number, Row[]>> {
  const extra = find.where ? ` AND (${find.where})` : "";
  let sql: string;
  if (find.kind === "within") {
    sql = `SELECT s.cid AS __cid, t.* EXCLUDE (geom) FROM sq s JOIN ${table} t ON ST_Intersects(t.geom, s.geom)${extra}`;
  } else {
    const r = find.kind === "nearest" ? find.maxM : find.radiusM;
    const keep = find.kind === "nearest" ? 1 : 500;
    sql = `
      SELECT * EXCLUDE (__rn) FROM (
        SELECT s.cid AS __cid, t.* EXCLUDE (geom), ST_Distance(${UTM("t.geom")}, ${UTM("s.geom")}) AS distanceM,
          row_number() OVER (PARTITION BY s.cid ORDER BY ST_Distance(${UTM("t.geom")}, ${UTM("s.geom")})) AS __rn
        FROM sq s JOIN ${table} t ON ST_Intersects(t.geom, ST_MakeEnvelope(
          s.lng - ${r} / (111320 * cos(radians(s.lat))), s.lat - ${r} / 111320,
          s.lng + ${r} / (111320 * cos(radians(s.lat))), s.lat + ${r} / 111320))${extra}
      ) WHERE distanceM <= ${r} AND __rn <= ${keep}
      ORDER BY __cid, distanceM`;
  }
  const out = new Map<number, Row[]>();
  for (const row of await rows(sql)) {
    const cid = Number(row.__cid);
    delete row.__cid;
    const list = out.get(cid) ?? out.set(cid, []).get(cid)!;
    if (find.kind !== "within" || list.length < 50) list.push(row);
  }
  return out;
}

async function mappedAll(table: string): Promise<Set<number> | undefined> {
  if (!loaded.has(table)) return undefined;
  const r = await rows(`SELECT DISTINCT s.cid AS __cid FROM sq s JOIN ${table} t ON ST_Intersects(t.geom, s.geom)`);
  return new Set(r.map((x) => Number(x.__cid)));
}

type Result = { reading?: Reading };
const results = new Map<string, Map<number, Result>>(); // dp id -> square -> reading (missing when absent)
const whyMissing = new Map<string, MissingReason>(); // dp id -> reason for every square without a reading (default noCoverage)
for (const dp of DATA_POINTS) {
  if (!/^[a-z0-9_]+$/.test(dp.table)) throw new Error(`bad table name in data point ${dp.id}: ${dp.table}`);
  const perSquare = new Map<number, Result>();
  results.set(dp.id, perSquare);
  if (!loaded.has(dp.table)) {
    whyMissing.set(dp.id, "notLoaded"); // missing for every square
    continue;
  }
  const t0 = Date.now();
  try {
    const found = await findAll(dp.table, dp.find);
    const mapped = dp.coverage ? await mappedAll(dp.coverage) : undefined;
    for (const s of squares) {
      const address: Address = {
        id: `grid-${s.cid}`, text: "", postcode: "", place: "", municipality: s.kommune,
        municipalityNumber: s.kommunenummer, lng: s.lng, lat: s.lat,
      };
      const isMapped = mapped ? mapped.has(s.cid) : undefined;
      const reading = dp.read(found.get(s.cid) ?? [], address, isMapped);
      if (reading) perSquare.set(s.cid, { reading });
    }
  } catch (err) {
    // Like the profile: a broken data point counts as missing, it doesn't stop the map.
    console.error(`  ${dp.id} (${dp.table}) failed, counted as missing:`, (err as Error).message);
    perSquare.clear();
    whyMissing.set(dp.id, "sourceUnavailable");
  }
  console.log(`  ${dp.id}: ${perSquare.size} squares (${Date.now() - t0} ms)`);
}

// ---------- Score each square exactly like the profile: overall, perspectives, plus raw values for /api/finn ----------
// Every column is NULL when we don't have the data (never a fake 0). Distances: NULL also when nothing was found
// within the data point's search radius (school 5 km, kindergarten 3 km, grocery 3 km, stop 2 km, trails 3 km, doctor 5 km).
const HAZARD_POINTS = DATA_POINTS.filter((dp) => dp.category === "hazards").map((dp) => dp.id);
const DISTANCES = {
  schoolM: "school", kindergartenM: "kindergarten", groceryM: "groceryStore", transitStopM: "transitStop", trailsM: "trails", doctorM: "doctor",
} as const;

type Out = {
  cid: number; score: number | null; capText: string | null; present: number; expected: number;
  living: number | null; building: number | null; family: number | null; commuter: number | null;
  hazard: boolean | null; quiet: boolean | null; noiseDb: number | null; transitDepartures: number | null;
} & Record<keyof typeof DISTANCES, number | null>;

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

/** true = a high/medium natural-hazard warning; false = hazard points read (where mapped) without one; null = none could be read. */
function hazardOf(get: (id: string) => Reading | undefined): boolean | null {
  const read = HAZARD_POINTS.map(get).filter((r): r is Reading => !!r && r.value !== "ikkeKartlagt");
  if (!read.length) return null;
  return read.some((r) => r.warning?.severity === "high" || r.warning?.severity === "medium");
}

// Oslo has no T-1442 data, so without the rule below most Oslo squares had quiet = NULL ("Rolig" dropped 436 of 725).
// The strategic noise map has no coverage outline, but its own metadata (STØYKILDENAVN on every feature from the
// Statens vegvesen WFS) says what was modelled: "ERF-veger med ÅDT over 8200, i storbyområdene alle ERF-veger og
// kommunale veger med ÅDT over 500". Oslo kommune (KOMM 301) is that storbyområde, so every road in Oslo with more than
// 500 vehicles a day is in the model, and no zone means those roads give under 50 dB Lden there. Roads left out carry
// under 500 vehicles a day, far too little to lift a spot to 55 dB (our "quiet" line). So inside Oslo, no zone = quiet.
// Outside Oslo only big roads are modelled, so there no zone stays unknown (unless T-1442 says outside its zones).
// Only when the strategic table loaded and its data point ran (a failed data point leaves an empty map).
const strategicOk = loaded.has("stoy_strategisk") && (results.get("roadNoiseStrategic")?.size ?? 0) > 0;

/** Road noise. noiseDb = highest known Lden lower bound; quiet = below 55 dB / outside the zones (null when unknown). */
function noiseOf(get: (id: string) => Reading | undefined, kommunenummer: string): { noiseDb: number | null; quiet: boolean | null } {
  const dbs: number[] = [];
  let quietSeen = false;
  const t1442 = get("roadNoise"); // value null = outside red/yellow zone (only read outside Oslo), "gul" = 55–65 dB, "rød" = 65+
  if (t1442) {
    if (t1442.value === "rød") dbs.push(65);
    else if (t1442.value === "gul") dbs.push(55);
    else quietSeen = true;
  }
  const strategic = get("roadNoiseStrategic"); // value = Lden lower bound of a 5 dB band (50..75); no zone = no reading
  const lden = strategic ? num(strategic.value) : null;
  if (lden != null) dbs.push(lden);
  else if (strategicOk && kommunenummer === OSLO) quietSeen = true; // see the comment above strategicOk
  const noiseDb = dbs.length ? Math.max(...dbs) : null;
  const quiet = noiseDb != null && noiseDb >= 55 ? false : noiseDb != null || quietSeen ? true : null;
  return { noiseDb, quiet };
}

const out: Out[] = [];
const stat = { overallNotOk: 0, dropped: 0 };
for (const s of squares) {
  // The same ReadingResult[] that buildProfile() makes for an address, in DATA_POINTS order. Squares all lie inside
  // kommuner, so never "outsideArea". assembleProfile() replaces a superseded reading on its own result object only.
  const readings: ReadingResult[] = DATA_POINTS.map((dp) => {
    const reading = results.get(dp.id)!.get(s.cid)?.reading;
    return reading ? { dp, reading } : { dp, reason: whyMissing.get(dp.id) ?? "noCoverage" };
  });
  const address: Address = {
    id: `grid-${s.cid}`, text: "", postcode: "", place: "", municipality: s.kommune,
    municipalityNumber: s.kommunenummer, lng: s.lng, lat: s.lat,
  };
  // Area shares only change the text of checks ("like most of Oslo"), never a score or warning, so none are passed.
  const p = assembleProfile(address, readings, false, new Map());
  // Readings after assembleProfile: a superseded awareness area has lost its warning, as on the address page.
  const byId = new Map(readings.map((x) => [x.dp.id, x.reading]));
  const get = (id: string) => byId.get(id);
  const r = p.rating;
  const ok = r.status === "ok" && r.score != null;
  if (!ok) stat.overallNotOk++;
  const persp: Record<string, number | null> = Object.fromEntries(
    p.perspectives.map((x) => [x.id, x.rating.status === "ok" && x.rating.score != null ? x.rating.score : null]));

  const distances = Object.fromEntries(Object.entries(DISTANCES).map(([col, id]) => [col, num(get(id)?.value)])) as Record<keyof typeof DISTANCES, number | null>;
  const row: Out = {
    cid: s.cid, score: ok ? r.score! : null, capText: ok ? (r.cappedBy?.[0]?.text ?? null) : null,
    present: r.coverage.present, expected: r.coverage.expected,
    living: persp.living ?? null, building: persp.building ?? null, family: persp.family ?? null, commuter: persp.commuter ?? null,
    hazard: hazardOf(get), ...noiseOf(get, s.kommunenummer), transitDepartures: num(get("transitDepartures")?.value), ...distances,
  };
  const { cid: _c, capText: _t, present: _p, expected: _e, ...values } = row;
  if (Object.values(values).every((v) => v == null)) {
    stat.dropped++;
    continue;
  }
  out.push(row);
}

const file = rawPath("omradescore.json");
await writeFile(file, JSON.stringify(out));
const COLS: Record<string, string> = {
  cid: "INTEGER", score: "INTEGER", capText: "VARCHAR", present: "INTEGER", expected: "INTEGER",
  living: "INTEGER", building: "INTEGER", family: "INTEGER", commuter: "INTEGER",
  hazard: "BOOLEAN", quiet: "BOOLEAN", noiseDb: "INTEGER", transitDepartures: "INTEGER",
  schoolM: "INTEGER", kindergartenM: "INTEGER", groceryM: "INTEGER", transitStopM: "INTEGER", trailsM: "INTEGER", doctorM: "INTEGER",
};
await conn.run(`
  CREATE OR REPLACE TABLE omradescore AS
  SELECT r.cid, r.score, r.capText, r.present, r.expected,
    r.living, r.building, r.family, r.commuter, r.hazard, r.quiet, r.noiseDb,
    r.schoolM, r.kindergartenM, r.groceryM, r.transitStopM, r.trailsM, r.doctorM, r.transitDepartures,
    coalesce(s.place || ', ', '') || s.kommune || coalesce(': ' || r.score, '') AS name, s.place, s.bydel,
    s.kommune, s.kommunenummer, 'Omnium (beregnet)' AS source,
    ST_MakeEnvelope(s.x, s.y, s.x + ${D_LNG}, s.y + ${D_LAT}) AS geom
  FROM read_json('${file.replace(/\\/g, "/")}', format = 'array',
    columns = {${Object.entries(COLS).map(([k, v]) => `${k}: '${v}'`).join(", ")}}) r
  JOIN sq s USING (cid)`);
const [st] = await query<Record<string, number>>(`
  SELECT count(*)::INTEGER AS n, count(score)::INTEGER AS scored, min(score) AS lo, max(score) AS hi, round(avg(score))::INTEGER AS avg,
    count(living)::INTEGER AS living, count(building)::INTEGER AS building, count(family)::INTEGER AS family, count(commuter)::INTEGER AS commuter,
    count(hazard)::INTEGER AS hazardKnown, (count(*) FILTER (hazard))::INTEGER AS hazardTrue,
    count(quiet)::INTEGER AS quietKnown, (count(*) FILTER (quiet))::INTEGER AS quietTrue, count(noiseDb)::INTEGER AS noiseDb,
    count(schoolM)::INTEGER AS schoolM, count(transitDepartures)::INTEGER AS transitDepartures,
    count(place)::INTEGER AS place, (count(*) FILTER (kommunenummer = '${OSLO}'))::INTEGER AS oslo,
    (count(bydel) FILTER (kommunenummer = '${OSLO}'))::INTEGER AS osloBydel,
    (count(quiet) FILTER (kommunenummer = '${OSLO}'))::INTEGER AS osloQuietKnown,
    (count(*) FILTER (kommunenummer = '${OSLO}' AND quiet))::INTEGER AS osloQuietTrue
  FROM omradescore`);
console.log(`omradescore: ${st.n} squares kept, ${stat.dropped} dropped (no data at all), ${stat.overallNotOk} without an overall score`);
console.log(`  score ${st.lo}–${st.hi} (average ${st.avg}) on ${st.scored} squares`);
console.log(`  perspectives: living ${st.living}, building ${st.building}, family ${st.family}, commuter ${st.commuter}`);
console.log(`  hazard known ${st.hazardKnown} (true ${st.hazardTrue}), quiet known ${st.quietKnown} (true ${st.quietTrue}), noiseDb ${st.noiseDb}, schoolM ${st.schoolM}, transitDepartures ${st.transitDepartures}`);
console.log(`  place ${st.place}/${st.n}; Oslo ${st.oslo} squares: bydel ${st.osloBydel}, quiet known ${st.osloQuietKnown} (true ${st.osloQuietTrue})`);
