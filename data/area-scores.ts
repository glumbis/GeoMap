// Area scores: rates every street address in Oslo + Akershus with the same rules as the address page, then
// summarises the scores per grunnkrets and per kommune. Owner: Sverre. Run: `npm run scores` after `npm run ingest`
// (stop `npm run dev` first: DuckDB lets only one process write the file).
//
// Why a separate command and not a data/scripts/ ingest: it needs every other table, and it takes a while.
// Speed: one profile on the page costs ~40 small queries (~0.5 s), so 360 000 addresses one by one would take days.
// Instead, for each block of addresses, every data point's table is joined against the whole block in ONE query, and
// the existing read() rules and rating (assembleProfile in api/src/profile.ts) run in memory. Same rules, same scores.
//
// Tables:
//   adresser          every street address (vegadresse) from Kartverket's address file, with its grunnkrets
//   adresse_scores    one row per address: status, overall score, category and perspective scores, warning counts
//   grunnkrets_scores per grunnkrets with at least MIN_ADDRESSES rated addresses: median and quartiles, share with a
//                     serious warning, perspective medians, polygon (map layer /api/grunnkrets_scores)
//   kommune_scores    the same per kommune (no polygon)
// Env: SCORES_LIMIT=20000 rates only the first N addresses (for a quick test).
import { existsSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import type { Address } from "../api/src/address.ts";
import { DATA_POINTS, type DataPoint, type Row } from "../api/src/datapoints.ts";
import { conn, query } from "../api/src/db.ts";
import { assembleProfile, type ReadingResult } from "../api/src/profile.ts";
import { download, rawPath, readZipEntry } from "./scripts/lib.ts";

const BASE = "https://nedlasting.geonorge.no/geonorge/Basisdata/MatrikkelenAdresse/CSV";
const COUNTIES = [
  { county: "oslo", file: "Basisdata_03_Oslo_4258_MatrikkelenAdresse_CSV" },
  { county: "akershus", file: "Basisdata_32_Akershus_4258_MatrikkelenAdresse_CSV" },
];
const CHUNK = 10_000;
const MIN_ADDRESSES = 5; // fewer rated addresses in an area = no area statistic (too few to mean anything)
const UTM = (g: string) => `ST_Transform(${g}, 'EPSG:4326', 'EPSG:25833', always_xy := true)`;
const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)} s`;

// ---- 1. Addresses ---------------------------------------------------------------------------------
const csvs: string[] = [];
for (const c of COUNTIES) {
  const csv = rawPath(`adresser_${c.county}.csv`);
  if (!existsSync(csv)) {
    const zip = await download(`${BASE}/${c.file}.zip`, `adresser_${c.county}.zip`);
    await writeFile(csv, await readZipEntry(zip, `${c.file}/matrikkelenAdresse.csv`));
  }
  csvs.push(csv);
}
// The id is built like lookupAddress() in api/src/address.ts: <kommunenummer>-<adressekode>-<nummer><BOKSTAV>.
await conn.run(`
  CREATE OR REPLACE TABLE adresser AS
  SELECT *, row_number() OVER (ORDER BY id) AS rn FROM (
    SELECT
      kommunenummer || '-' || CAST(adressekode AS INTEGER) || '-' || CAST(nummer AS INTEGER) || upper(coalesce(bokstav, '')) AS id,
      adresseTekst AS name, postnummer AS postcode, poststed AS place, kommunenummer, kommunenavn AS municipality,
      grunnkretsnummer, CAST("Øst" AS DOUBLE) AS lng, CAST("Nord" AS DOUBLE) AS lat,
      ST_Point(CAST("Øst" AS DOUBLE), CAST("Nord" AS DOUBLE)) AS geom
    FROM read_csv([${csvs.map((f) => `'${f}'`).join(", ")}], delim = ';', header = true, all_varchar = true)
    WHERE adressetype = 'vegadresse' AND "Øst" IS NOT NULL
    QUALIFY row_number() OVER (PARTITION BY id) = 1
  )
`);
const limit = Number(process.env.SCORES_LIMIT) || Infinity;
const [{ total }] = await query<{ total: number }>("SELECT count(*)::INTEGER AS total FROM adresser");
const toRate = Math.min(total, limit);
console.log(`adresser: ${total} street addresses, rating ${toRate} (${elapsed()})`);

// ---- 2. Prepare the tables the data points read -----------------------------------------------------
const loaded = new Set((await query<{ t: string }>("SELECT table_name AS t FROM duckdb_tables()")).map((r) => r.t));
const key = (dp: DataPoint) => JSON.stringify([dp.table, dp.find]);
const lookups = new Map<string, DataPoint>(); // one query per distinct (table, find)
for (const dp of DATA_POINTS) if (loaded.has(dp.table)) lookups.set(key(dp), dp);
const coverageTables = [...new Set(DATA_POINTS.map((d) => d.coverage).filter((t): t is string => !!t && loaded.has(t)))];
// Distance searches need metres: a projected copy (EPSG:25833) of each table, made once.
for (const t of new Set([...lookups.values()].filter((d) => d.find.kind !== "within").map((d) => d.table))) {
  await conn.run(`CREATE OR REPLACE TEMP TABLE __utm_${t} AS SELECT * EXCLUDE (geom), ${UTM("geom")} AS __gu FROM ${t}`);
}

/** Rows per address id for one (table, find), for the current block. Mirrors findRows() in api/src/profile.ts. */
async function blockRows(dp: DataPoint): Promise<Map<string, Row[]>> {
  const extra = dp.find.where ? ` AND (${dp.find.where})` : "";
  let rows: Row[];
  if (dp.find.kind === "within") {
    rows = await query(`SELECT c.__aid, t.* EXCLUDE (geom) FROM __block c JOIN ${dp.table} t ON ST_Intersects(t.geom, c.__g) WHERE true${extra}`);
  } else {
    const r = dp.find.kind === "nearest" ? dp.find.maxM : dp.find.radiusM;
    // "nearest" keeps only the closest row per address inside the database (findRows: ORDER BY distance LIMIT 1),
    // so thousands of candidates within a few km never leave DuckDB. "around" keeps up to 500, like findRows.
    const keepN = dp.find.kind === "nearest" ? 1 : 500;
    rows = await query(`
      SELECT * FROM (
        SELECT c.__aid, t.* EXCLUDE (__gu), ST_Distance(c.__gu, t.__gu) AS distanceM
        FROM __block c JOIN __utm_${dp.table} t ON ST_DWithin(c.__gu, t.__gu, ${r}) WHERE true${extra}
      ) QUALIFY row_number() OVER (PARTITION BY __aid ORDER BY distanceM) <= ${keepN}`);
  }
  const by = new Map<string, Row[]>();
  for (const { __aid, ...row } of rows as (Row & { __aid: string })[]) {
    const list = by.get(__aid);
    if (list) list.push(row);
    else by.set(__aid, [row]);
  }
  if (dp.find.kind !== "within") {
    const keep = dp.find.kind === "nearest" ? 1 : 500; // like findRows: nearest = closest one, around = up to 500
    for (const [id, list] of by) by.set(id, list.sort((a, b) => Number(a.distanceM) - Number(b.distanceM)).slice(0, keep));
  }
  return by;
}

async function inside(table: string): Promise<Set<string>> {
  const rows = await query<{ id: string }>(`SELECT DISTINCT c.__aid AS id FROM __block c JOIN ${table} t ON ST_Intersects(t.geom, c.__g)`);
  return new Set(rows.map((r) => r.id));
}

// ---- 3. Rate block by block --------------------------------------------------------------------------
const out = rawPath("adresse_scores.jsonl");
await writeFile(out, "");
let failures = 0;
for (let lo = 1; lo <= toRate; lo += CHUNK) {
  const hi = Math.min(lo + CHUNK, toRate + 1);
  await conn.run(`
    CREATE OR REPLACE TEMP TABLE __block AS
    SELECT id AS __aid, name, postcode, place, municipality, kommunenummer, grunnkretsnummer, lng, lat, geom AS __g, ${UTM("geom")} AS __gu
    FROM adresser WHERE rn >= ${lo} AND rn < ${hi}`);
  const addresses = await query<{ __aid: string; name: string; postcode: string; place: string; municipality: string; kommunenummer: string; grunnkretsnummer: string; lng: number; lat: number }>(
    "SELECT __aid, name, postcode, place, municipality, kommunenummer, grunnkretsnummer, lng, lat FROM __block");

  const rowsByLookup = new Map<string, Map<string, Row[]>>();
  const timing: string[] = [];
  for (const [k, dp] of lookups) {
    const t0 = Date.now();
    rowsByLookup.set(k, await blockRows(dp));
    timing.push(`${dp.table}/${dp.find.kind}=${Date.now() - t0}ms`);
  }
  if (lo === 1 && process.env.SCORES_TIMING) console.log("  query time per table:", timing.join(", "));
  const covered = new Map<string, Set<string>>();
  for (const t of coverageTables) covered.set(t, await inside(t));
  const inStudyArea = await inside("kommuner");

  const lines: string[] = [];
  for (const a of addresses) {
    const address: Address = {
      id: a.__aid, text: a.name, postcode: a.postcode, place: a.place,
      municipality: a.municipality, municipalityNumber: a.kommunenummer, lng: a.lng, lat: a.lat,
    };
    const outside = !inStudyArea.has(a.__aid);
    // Same order and rules as buildProfile() in api/src/profile.ts.
    const results: ReadingResult[] = DATA_POINTS.map((dp) => {
      if (outside) return { dp, reason: "outsideArea" };
      if (!loaded.has(dp.table)) return { dp, reason: "notLoaded" };
      try {
        const mapped = dp.coverage && loaded.has(dp.coverage) ? covered.get(dp.coverage)!.has(a.__aid) : undefined;
        const reading = dp.read(rowsByLookup.get(key(dp))!.get(a.__aid) ?? [], address, mapped);
        return reading ? { dp, reading } : { dp, reason: "noCoverage" };
      } catch {
        failures++;
        return { dp, reason: "sourceUnavailable" };
      }
    });
    const p = assembleProfile(address, results, outside);
    const severities = p.warnings.map((w) => w.severity);
    lines.push(JSON.stringify({
      id: a.__aid,
      kommunenummer: a.kommunenummer,
      grunnkretsnummer: a.grunnkretsnummer,
      status: p.rating.status,
      score: p.rating.score ?? null,
      capped: (p.rating.cappedBy?.length ?? 0) > 0,
      highWarnings: severities.filter((s) => s === "high").length,
      mediumWarnings: severities.filter((s) => s === "medium").length,
      ...Object.fromEntries(p.categories.map((c) => [`cat_${c.id}`, c.rating.score ?? null])),
      ...Object.fromEntries(p.perspectives.map((x) => [`p_${x.id}`, x.rating.score ?? null])),
    }));
  }
  await appendFile(out, lines.join("\n") + "\n");
  console.log(`  rated ${hi - 1} / ${toRate} (${elapsed()})`);
}
if (failures) console.warn(`  ${failures} data point readings failed and were left out (shown as missing, like on the page)`);

// ---- 4. Tables -----------------------------------------------------------------------------------------
await conn.run(`
  CREATE OR REPLACE TABLE adresse_scores AS
  SELECT s.*, a.name, now() AS computedAt, a.geom
  FROM read_json('${out}', format = 'newline_delimited', sample_size = -1) s JOIN adresser a USING (id)
`);
const perspectiveCols = (await query<{ c: string }>(
  "SELECT column_name AS c FROM duckdb_columns() WHERE table_name = 'adresse_scores' AND column_name LIKE 'p\\_%' ESCAPE '\\'",
)).map((r) => r.c);
const stats = () => `
  count(*)::INTEGER AS addresses,
  round(median(s.score))::INTEGER AS medianScore,
  round(quantile_cont(s.score, 0.25))::INTEGER AS p25,
  round(quantile_cont(s.score, 0.75))::INTEGER AS p75,
  round(100.0 * avg(CASE WHEN s.highWarnings > 0 THEN 1 ELSE 0 END))::INTEGER AS pctHighWarning,
  round(100.0 * avg(CASE WHEN s.highWarnings + s.mediumWarnings > 0 THEN 1 ELSE 0 END))::INTEGER AS pctSeriousWarning,
  ${perspectiveCols.map((c) => `round(median(s.${c}))::INTEGER AS ${c.replace(/^p_/, "median_")}`).join(",\n  ")}`;
await conn.run(`
  CREATE OR REPLACE TABLE grunnkrets_scores AS
  SELECT g.id, any_value(g.name) AS name, any_value(g.kommunenummer) AS kommunenummer, ${stats()},
    'Omnium (beregnet fra offentlige data)' AS source, any_value(g.geom) AS geom
  FROM grunnkretser g JOIN adresse_scores s ON s.grunnkretsnummer = g.id
  WHERE s.status = 'ok'
  GROUP BY g.id HAVING count(*) >= ${MIN_ADDRESSES}
`);
await conn.run(`
  CREATE OR REPLACE TABLE kommune_scores AS
  SELECT s.kommunenummer AS id, any_value(k.name) AS name, ${stats()}
  FROM adresse_scores s JOIN kommuner k ON k.kommunenummer = s.kommunenummer
  WHERE s.status = 'ok'
  GROUP BY s.kommunenummer HAVING count(*) >= ${MIN_ADDRESSES}
`);
const [sum] = await query<{ rated: number; ok: number; median: number; g: number; k: number }>(`
  SELECT count(*)::INTEGER AS rated, count(*) FILTER (status = 'ok')::INTEGER AS ok, round(median(score))::INTEGER AS median,
    (SELECT count(*) FROM grunnkrets_scores)::INTEGER AS g, (SELECT count(*) FROM kommune_scores)::INTEGER AS k
  FROM adresse_scores`);
console.log(`adresse_scores: ${sum.rated} rated, ${sum.ok} with a score (median ${sum.median}); grunnkrets_scores: ${sum.g}; kommune_scores: ${sum.k} (${elapsed()})`);
