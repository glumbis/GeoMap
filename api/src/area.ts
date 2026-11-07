// How one address compares with the other street addresses in its grunnkrets and kommune.
// Used by GET /api/omrade/:id and the PDF report ("Sammenlignet med området", docs/REPORT.md).
// The address's own score is the live profile score (the same number as on the page); the other addresses' scores come
// from `adresse_scores`, built by `npm run scores` (data/area-scores.ts) at `computedAt`.
// percentile = share of rated addresses in the area that score lower, ties counted half: 70 means "better than about
// 70 % of the addresses here". An area with fewer than 5 rated addresses is left out (too few to compare with).
// histogram = how many addresses in the area score 0-9, 10-19, ... 90-100 (10 bins, 100 counts in the last one).
import { query, tableExists } from "./db.ts";
import type { Profile } from "./profile.ts";

const MIN_ADDRESSES = 5;

export interface Area { id: string; name: string; addresses: number; medianScore: number; percentile?: number; histogram: number[] }

export interface AreaComparison {
  addressId: string;
  score: number | null;
  reason?: string;
  computedAt: string;
  grunnkrets?: Area;
  kommune?: Area;
}

async function compare(column: "grunnkretsnummer" | "kommunenummer", value: string | undefined, name: string | undefined, score: number | undefined): Promise<Area | undefined> {
  if (!value) return undefined;
  const [s] = await query<{ addresses: number; below: number; same: number; medianScore: number }>(
    `SELECT count(*)::INTEGER AS addresses,
       count(*) FILTER (score < $2)::INTEGER AS below,
       count(*) FILTER (score = $2)::INTEGER AS same,
       round(median(score))::INTEGER AS medianScore
     FROM adresse_scores WHERE ${column} = $1 AND status = 'ok'`,
    [value, score ?? -1],
  );
  if (!s || s.addresses < MIN_ADDRESSES) return undefined;
  const bins = await query<{ bin: number; n: number }>(
    `SELECT least(floor(score / 10), 9)::INTEGER AS bin, count(*)::INTEGER AS n
     FROM adresse_scores WHERE ${column} = $1 AND status = 'ok' GROUP BY 1`,
    [value],
  );
  const histogram = Array.from({ length: 10 }, (_, i) => bins.find((b) => b.bin === i)?.n ?? 0);
  const area: Area = { id: value, name: name ?? value, addresses: s.addresses, medianScore: s.medianScore, histogram };
  if (score != null) area.percentile = Math.round((100 * (s.below + s.same / 2)) / s.addresses);
  return area;
}

/** undefined when the area scores are not built yet (`npm run scores`). */
export async function compareWithArea(profile: Profile): Promise<AreaComparison | undefined> {
  if (!(await tableExists("adresse_scores"))) return undefined;
  const a = profile.address;
  const score = profile.rating.status === "ok" ? profile.rating.score : undefined;

  // Grunnkrets from the address file; fall back to the polygon for an address that is not in it (e.g. a new one).
  const [stored] = await query<{ grunnkretsnummer: string }>("SELECT grunnkretsnummer FROM adresse_scores WHERE id = $1", [a.id]);
  const hasGk = await tableExists("grunnkretser");
  let gk = stored?.grunnkretsnummer;
  if (!gk && hasGk) {
    gk = (await query<{ id: string }>("SELECT id FROM grunnkretser WHERE ST_Intersects(geom, ST_Point($1, $2)) LIMIT 1", [a.lng, a.lat]))[0]?.id;
  }
  const [gkName] = gk && hasGk ? await query<{ name: string }>("SELECT name FROM grunnkretser WHERE id = $1", [gk]) : [];
  const [{ computedAt }] = await query<{ computedAt: string }>(
    "SELECT strftime(max(computedAt)::TIMESTAMP, '%Y-%m-%dT%H:%M:%S') AS computedAt FROM adresse_scores");
  // Geonorge spells kommune names in capitals; the kommuner table has the normal spelling ("Bærum").
  const [kName] = await query<{ name: string }>("SELECT name FROM kommuner WHERE kommunenummer = $1", [a.municipalityNumber]);

  const grunnkrets = await compare("grunnkretsnummer", gk, gkName?.name, score);
  const kommune = await compare("kommunenummer", a.municipalityNumber, kName?.name ?? a.municipality, score);
  return {
    addressId: a.id,
    score: score ?? null,
    ...(score == null && { reason: profile.rating.reason ?? "Adressen har ingen samlet karakter." }),
    computedAt,
    ...(grunnkrets && { grunnkrets }),
    ...(kommune && { kommune }),
  };
}
