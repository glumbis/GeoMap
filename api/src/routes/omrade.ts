import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { query, tableExists } from "../db.ts";
import { buildProfile } from "../profile.ts";

// GET /api/omrade/:id -> how one address compares with the other street addresses in its grunnkrets and kommune.
// The address's own score is computed live (the same number as on the page); the other addresses' scores come from
// `adresse_scores`, built by `npm run scores` (data/area-scores.ts) at `computedAt`.
// percentile = share of rated addresses in the area that score lower, ties counted half: 70 means "better than about
// 70 % of the addresses here". An area with fewer than 5 rated addresses is left out (too few to compare with).
// Response: { addressId, score, computedAt, grunnkrets?, kommune? } with each area
//   { id, name, addresses, medianScore, percentile }. When the address itself has no score: score null + reason,
//   and areas without percentile.
const MIN_ADDRESSES = 5;

interface Area { id: string; name: string; addresses: number; medianScore: number; percentile?: number }

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
  const area: Area = { id: value, name: name ?? value, addresses: s.addresses, medianScore: s.medianScore };
  if (score != null) area.percentile = Math.round((100 * (s.below + s.same / 2)) / s.addresses);
  return area;
}

export default new Hono().get("/:id", async (c) => {
  if (!(await tableExists("adresse_scores"))) {
    throw new HTTPException(503, { message: "Area scores are not built yet. Run: npm run scores" });
  }
  const profile = await buildProfile(c.req.param("id"));
  const a = profile.address;
  const score = profile.rating.status === "ok" ? profile.rating.score : undefined;

  // Grunnkrets from the address file; fall back to the polygon for an address that is not in it (e.g. a new one).
  const [stored] = await query<{ grunnkretsnummer: string; computedAt: string }>(
    "SELECT grunnkretsnummer, computedAt FROM adresse_scores WHERE id = $1", [a.id]);
  let gk = stored?.grunnkretsnummer;
  if (!gk && (await tableExists("grunnkretser"))) {
    gk = (await query<{ id: string }>("SELECT id FROM grunnkretser WHERE ST_Intersects(geom, ST_Point($1, $2)) LIMIT 1", [a.lng, a.lat]))[0]?.id;
  }
  const [gkName] = gk && (await tableExists("grunnkretser"))
    ? await query<{ name: string }>("SELECT name FROM grunnkretser WHERE id = $1", [gk]) : [];
  const [{ computedAt }] = await query<{ computedAt: string }>(
    "SELECT strftime(max(computedAt)::TIMESTAMP, '%Y-%m-%dT%H:%M:%S') AS computedAt FROM adresse_scores");
  // Geonorge spells kommune names in capitals; the kommuner table has the normal spelling ("Bærum").
  const [kName] = await query<{ name: string }>("SELECT name FROM kommuner WHERE kommunenummer = $1", [a.municipalityNumber]);

  const grunnkrets = await compare("grunnkretsnummer", gk, gkName?.name, score);
  const kommune = await compare("kommunenummer", a.municipalityNumber, kName?.name ?? a.municipality, score);
  return c.json({
    addressId: a.id,
    score: score ?? null,
    ...(score == null && { reason: profile.rating.reason ?? "Adressen har ingen samlet karakter." }),
    computedAt,
    ...(grunnkrets && { grunnkrets }),
    ...(kommune && { kommune }),
  });
});
