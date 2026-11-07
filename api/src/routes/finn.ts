// Reverse search ("finn steder som passer"). Owner: Erik. Data: table omradescore (data/scripts/zz_omradescore.ts),
// 500 m squares where people live, each with overall + perspective scores and raw values at the square's centre.
//
// GET /api/finn?minScore=&minLiving=&minBuilding=&minFamily=&minCommuter=&noHazard=1&quiet=1
//   &maxSchoolM=&maxKindergartenM=&maxGroceryM=&maxTransitStopM=&maxTrailsM=&maxDoctorM=&minTransitDepartures=
//   &kommune=<name or number>&bbox=minLng,minLat,maxLng,maxLat&limit=5000 (max 10000)
//   -> GeoJSON FeatureCollection of matching squares + matched (before limit), total (all squares), criteria (parsed).
//   kommune is forgiving ("baerum", "Lorenskog", "Oslo kommune" all work); one we don't know matches nothing.
//   Each square has place (grunnkrets name) and, in Oslo, bydel.
//   A NULL value never satisfies a criterion: unknown is not "fits". A NULL distance means nothing within the
//   data point's search radius, so it fails any max-distance criterion.
// GET /api/finn/kommuner -> { kommuner: [{ name, number, squares }] } the municipalities in the data, by name.
// GET /api/finn/tolk?q=<free Norwegian text> -> { criteria, explanation } via Claude Haiku. 503 without ANTHROPIC_API_KEY.
// GET /api/finn/tolk/status -> { available } whether the free-text search can work (ANTHROPIC_API_KEY is set).
import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { query, tableExists } from "../db.ts";
import { CriteriaError, criteriaWhere, matchKommune, parseBbox, parseLimit, parseQuery, sanitizeAi, type Criteria } from "../finnCriteria.ts";

const TABLE = "omradescore";
const MODEL = "claude-haiku-5-5";

async function needTable() {
  if (!(await tableExists(TABLE))) {
    throw new HTTPException(503, { message: `Table '${TABLE}' is not loaded. Run: npm run ingest zz_omradescore` });
  }
}

function bad(err: unknown): never {
  if (err instanceof CriteriaError) throw new HTTPException(400, { message: err.message });
  throw err;
}

const PROPS = [
  "cid", "score", "living", "building", "family", "commuter", "hazard", "quiet", "noiseDb",
  "schoolM", "kindergartenM", "groceryM", "transitStopM", "trailsM", "doctorM", "transitDepartures", "kommune", "place", "bydel", "capText",
];

const app = new Hono();

type Kommune = { name: string; number: string; squares: number };
async function kommuner(): Promise<Kommune[]> {
  return query<Kommune>(
    `SELECT kommune AS name, kommunenummer AS number, count(*)::INTEGER AS squares FROM ${TABLE}
     WHERE kommune IS NOT NULL GROUP BY 1, 2 ORDER BY 1`,
  );
}

app.get("/kommuner", async (c) => {
  await needTable();
  return c.json({ kommuner: await kommuner() });
});

app.get("/tolk/status", (c) => c.json({ available: !!process.env.ANTHROPIC_API_KEY }));

app.get("/", async (c) => {
  await needTable();
  let criteria: Criteria, bbox: ReturnType<typeof parseBbox>, limit: number;
  try {
    criteria = parseQuery(c.req.query());
    bbox = parseBbox(c.req.query("bbox"));
    limit = parseLimit(c.req.query("limit"));
  } catch (err) {
    bad(err);
  }

  if (criteria.kommune) {
    // Forgiving match against the names and numbers we have; unknown stays as given (and matches nothing).
    const list = await kommuner();
    const hit = matchKommune(criteria.kommune, list.flatMap((k) => [k.name, k.number]));
    if (hit) criteria.kommune = hit;
  }
  const { where, params } = criteriaWhere(criteria);
  const all: (string | number)[] = [...params];
  if (bbox) {
    const n = all.length;
    all.push(...bbox);
    where.push(`ST_Intersects(geom, ST_MakeEnvelope($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}))`);
  }
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [counts] = await query<{ matched: number; total: number }>(
    `SELECT (count(*) FILTER (${where.length ? where.join(" AND ") : "true"}))::INTEGER AS matched, count(*)::INTEGER AS total FROM ${TABLE}`,
    all,
  );
  const rows = await query<{ f: string }>(
    `SELECT to_json(t) AS f FROM (
       SELECT ${PROPS.join(", ")}, ST_AsGeoJSON(ST_ReducePrecision(geom, 0.000001)) AS __geometry
       FROM ${TABLE} ${filter}
       ORDER BY score DESC NULLS LAST, cid
       LIMIT ${limit}
     ) t`,
    all,
  );

  return c.json({
    type: "FeatureCollection",
    matched: counts.matched,
    total: counts.total,
    criteria,
    features: rows.map((r) => {
      const { __geometry, ...properties } = JSON.parse(r.f);
      return { type: "Feature", geometry: typeof __geometry === "string" ? JSON.parse(__geometry) : __geometry, properties };
    }),
  });
});

// ---------- Free text -> criteria ----------

const SYSTEM = `Du gjør om et ønske om bosted i Oslo og Akershus til søkekriterier. Svar BARE med ett JSON-objekt, uten tekst rundt:
{"criteria": {...}, "explanation": "<én kort norsk setning om hvordan du forsto ønsket>"}
Lovlige nøkler i criteria (ta bare med det teksten ber om):
- minScore: samlet score 0-100 ("score over 70" -> 70)
- minLiving: "Bo her"-score 0-100 (godt å bo, hverdagsliv)
- minBuilding: "Bygge her"-score 0-100 (bygge, grave, god grunn)
- minFamily: "Familie"-score 0-100 ("barnefamilie", "barn" -> 60 hvis ikke noe tall er gitt)
- minCommuter: "Pendler"-score 0-100 ("pendle", "kollektivt", "god kollektivdekning" -> 60 hvis ikke noe tall)
- noHazard: true ("trygg", "ingen naturfare", "ikke flom/kvikkleire/skred")
- quiet: true ("rolig", "stille", "lite støy", "lite trafikk")
- maxSchoolM: meter til nærmeste grunnskole ("nær skole" -> 1000 hvis ikke noe tall; "innen 1 km" -> 1000)
- maxKindergartenM: meter til nærmeste barnehage ("nær barnehage" -> 800)
- maxGroceryM: meter til nærmeste dagligvarebutikk ("nær butikk" -> 800)
- maxTransitStopM: meter til nærmeste holdeplass ("nær buss/trikk/T-bane" -> 500)
- maxTrailsM: meter til nærmeste tursti eller skiløype ("nær marka/turområde" -> 1000)
- maxDoctorM: meter til nærmeste legekontor ("nær lege" -> 1500)
- minTransitDepartures: avganger per dag fra travleste holdeplass innen 500 m ("mange avganger" -> 100)
- kommune: navnet på én kommune i Oslo eller Akershus, slik det skrives (f.eks. "Oslo", "Bærum", "Lillestrøm")
Avstander alltid i meter (100-10000). Finn ikke på kriterier teksten ikke ber om.`;

const cache = new Map<string, { criteria: Criteria; explanation: string }>();
let client: Anthropic | undefined;

app.get("/tolk", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) throw new HTTPException(400, { message: "q is required: free text, e.g. ?q=rolig sted for barnefamilie" });
  if (q.length > 500) throw new HTTPException(400, { message: "q must be at most 500 characters" });
  const key = q.toLowerCase().replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit) return c.json(hit);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HTTPException(503, { message: "Kan ikke tolke teksten nå: AI-nøkkelen mangler på serveren. Bruk filtrene i stedet." });
  }
  await needTable();
  const known = (await kommuner()).flatMap((k) => [k.name, k.number]);

  let text: string;
  try {
    client ??= new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: q }],
    });
    text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error("finn/tolk: invalid ANTHROPIC_API_KEY");
    else if (err instanceof Anthropic.APIError) console.error(`finn/tolk: API error ${err.status}: ${err.message}`);
    else console.error(`finn/tolk: ${(err as Error).message}`);
    throw new HTTPException(503, { message: "Kan ikke tolke teksten nå: AI-tjenesten svarte ikke. Prøv igjen, eller bruk filtrene." });
  }

  let parsed: { criteria?: unknown; explanation?: unknown };
  try {
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    parsed = JSON.parse(json);
  } catch {
    console.error(`finn/tolk: not JSON: ${text.slice(0, 200)}`);
    throw new HTTPException(503, { message: "Kan ikke tolke teksten nå: fikk et uventet svar. Prøv å skrive det på en annen måte." });
  }
  const criteria = sanitizeAi(parsed.criteria, known);
  const explanation = typeof parsed.explanation === "string" && parsed.explanation.trim()
    ? parsed.explanation.trim().slice(0, 300)
    : "Fant ingen kriterier i teksten.";
  const result = { criteria, explanation };
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return c.json(result);
});

export default app;
