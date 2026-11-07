// Zone statistics for the report (docs/REPORT.md): how far the nearest zone of a kind is, and how many of the
// street addresses in the grunnkrets and the kommune lie inside such a zone ("is this common here?").
// Addresses come from the `adresser` table (Kartverket's address file, built by `npm run scores`, data/area-scores.ts).
// Every `where` is fixed SQL from this repo (DATA_POINTS or report.ts), never user input.
// The address counts are slow for big zone layers (flood awareness in Oslo: ~10 s), so they are stored in the table
// `zone_shares`, keyed by kommune, zone set and the row counts of the tables: a new ingest gives a new key.
import { conn, query } from "./db.ts";
import { findRows } from "./profile.ts";

/** One kind of zone: a table and an optional filter on its own columns. */
export interface ZoneSource { table: string; where?: string }

export interface Share { addresses: number; inside: number; percent: number }
export interface AreaShares { grunnkrets?: Share & { name?: string }; kommune?: Share & { name?: string } }

const SAFE = /^[a-z0-9_]+$/;

let loadedCache: { at: number; tables: Set<string> } | undefined;
/** Tables in the database, cached for a minute (an ingest can add tables while the API runs). */
export async function loadedTables(): Promise<Set<string>> {
  if (!loadedCache || Date.now() - loadedCache.at > 60_000) {
    const rows = await query<{ t: string }>("SELECT table_name AS t FROM duckdb_tables()");
    loadedCache = { at: Date.now(), tables: new Set(rows.map((r) => r.t)) };
  }
  return loadedCache.tables;
}

/** Metres to the nearest zone within maxM (0 inside it), undefined when none is that close or the table is missing. */
export async function nearestZoneM(src: ZoneSource, lng: number, lat: number, maxM: number): Promise<number | undefined> {
  if (!(await loadedTables()).has(src.table)) return undefined;
  const [row] = await findRows(src.table, { kind: "nearest", maxM, ...(src.where && { where: src.where }) }, lng, lat);
  return row ? Number(row.distanceM) : undefined;
}

await conn.run(`CREATE TABLE IF NOT EXISTS zone_shares (key VARCHAR, gk VARCHAR, n INTEGER, hit INTEGER, computed TIMESTAMP DEFAULT current_timestamp)`);

type ByGk = Map<string, { n: number; hit: number }>;
/** Per kommune and zone set: inside / all addresses per grunnkrets. In memory, and in `zone_shares` across restarts. */
const cache = new Map<string, Promise<ByGk>>();

async function perGrunnkrets(sources: ZoneSource[], kommune: string): Promise<ByGk> {
  for (const s of sources) if (!SAFE.test(s.table)) throw new Error(`bad table name: ${s.table}`);
  const tables = [...new Set(["adresser", ...sources.map((s) => s.table)])];
  const counts = await query<{ n: number }>(tables.map((t) => `SELECT count(*)::INTEGER AS n FROM ${t}`).join(" UNION ALL "));
  const key = `${kommune}|${sources.map((s) => `${s.table}:${s.where ?? ""}`).join("|")}|${counts.map((c) => c.n).join(",")}`;
  if (!cache.has(key)) {
    const run = (async () => {
      const read = async () => new Map((await query<{ gk: string; n: number; hit: number }>("SELECT gk, n, hit FROM zone_shares WHERE key = $1", [key]))
        .map((r) => [r.gk, { n: r.n, hit: r.hit }]));
      const stored = await read();
      if (stored.size) return stored;
      // Zones first cut to the kommune's bounding box, then one spatial join per source; UNION = inside any of them.
      const hits = sources.map((s, i) => `
        SELECT a.id FROM a JOIN (SELECT geom FROM ${s.table} WHERE ST_Intersects(geom, (SELECT box FROM b))${s.where ? ` AND (${s.where})` : ""}) z${i}
        ON ST_Intersects(z${i}.geom, a.geom)`).join(" UNION ");
      await query(
        `INSERT INTO zone_shares (key, gk, n, hit)
         WITH a AS (SELECT id, coalesce(grunnkretsnummer, '') AS gk, geom FROM adresser WHERE kommunenummer = $2),
              b AS (SELECT ST_Extent_Agg(geom)::GEOMETRY AS box FROM a),
              h AS (SELECT DISTINCT id FROM (${hits}))
         SELECT $1, a.gk, count(*)::INTEGER, count(h.id)::INTEGER FROM a LEFT JOIN h USING (id) GROUP BY a.gk`,
        [key, kommune],
      );
      return read();
    })();
    run.catch(() => cache.delete(key)); // try again next time
    cache.set(key, run);
  }
  return cache.get(key)!;
}

const share = (n: number, hit: number): Share => ({ addresses: n, inside: hit, percent: n ? (100 * hit) / n : 0 });

/**
 * Share of the street addresses in the address's grunnkrets and kommune that lie inside any of the zones.
 * undefined when the address table or every zone table is missing. A grunnkrets with under 5 addresses is left out.
 */
export async function addressShares(sources: ZoneSource[], kommune: string, grunnkrets: string | undefined): Promise<AreaShares | undefined> {
  const loaded = await loadedTables();
  const present = sources.filter((s) => loaded.has(s.table));
  if (!loaded.has("adresser") || !present.length) return undefined;
  const byGk = await perGrunnkrets(present, kommune);
  let n = 0, hit = 0;
  for (const v of byGk.values()) { n += v.n; hit += v.hit; }
  if (!n) return undefined;
  const gk = grunnkrets ? byGk.get(grunnkrets) : undefined;
  return { kommune: share(n, hit), ...(gk && gk.n >= 5 && { grunnkrets: share(gk.n, gk.hit) }) };
}

/** The address's grunnkrets (from the address file) and the names of its grunnkrets and kommune. */
export async function addressArea(id: string, kommune: string): Promise<{ grunnkrets?: string; grunnkretsName?: string; kommuneName?: string }> {
  const loaded = await loadedTables();
  const gk = loaded.has("adresser")
    ? (await query<{ gk: string }>("SELECT grunnkretsnummer AS gk FROM adresser WHERE id = $1", [id]))[0]?.gk
    : undefined;
  const gkName = gk && loaded.has("grunnkretser")
    ? (await query<{ name: string }>("SELECT name FROM grunnkretser WHERE id = $1", [gk]))[0]?.name
    : undefined;
  const kName = loaded.has("kommuner")
    ? (await query<{ name: string }>("SELECT name FROM kommuner WHERE kommunenummer = $1", [kommune]))[0]?.name
    : undefined;
  return { ...(gk && { grunnkrets: gk }), ...(gkName && { grunnkretsName: gkName }), ...(kName && { kommuneName: kName }) };
}
