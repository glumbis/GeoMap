// AI summary for an address (PLAN.md -> "AI summary").
// 1. Template step: every data point, warning, missing point and rating becomes a fact sentence, most serious first.
// 2. AI step: Claude Haiku 5.5 writes 4-6 plain Norwegian sentences from those facts only.
// 3. Cached in DuckDB table `summaries`, keyed by address id + a hash of model, prompt and facts (new data or prompt = new summary).
// 4. If the AI call fails (no key, API down, refusal), the fact sentences are returned instead. Never cached.
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { conn, query } from "./db.ts";
import { buildProfile, type MissingDataPoint, type PresentDataPoint, type Profile } from "./profile.ts";

const MODEL = "claude-haiku-5-5";

export interface Fact {
  text: string;
  severity?: "high" | "medium" | "low";
  dataPointId?: string;
}

export interface Summary {
  addressId: string;
  text: string;
  aiGenerated: boolean;
  model?: string;
  created?: string;
  facts: Fact[];
}

await conn.run(`CREATE TABLE IF NOT EXISTS summaries (
  address_id VARCHAR, facts_hash VARCHAR, text VARCHAR, model VARCHAR, created TIMESTAMP,
  PRIMARY KEY (address_id, facts_hash))`);

// ---- Template step: the fact-sentence rules of docs/FACTS.md (Even). Change the rules there first. ----

type Point = PresentDataPoint;
/** A rule returns [rank, sentence without the source]. Ranks: docs/FACTS.md -> "Ranks". */
type Rule = (d: Point) => [number, string];

const SEVERITY_RANK = { high: 1, medium: 2, low: 3 } as const;
/** Rank of a warning sentence, or `ok` when there is no warning. */
const rankOf = (d: Point, ok: number) => (d.warning ? SEVERITY_RANK[d.warning.severity] : ok);

/** "31 m (Arendalsgata)" -> { distance: "31 m", name: "Arendalsgata" }. */
function splitDisplay(display: string) {
  const m = /^(.*?) \((.*)\)$/.exec(display);
  return m ? { head: m[1], bracket: m[2] } : { head: display, bracket: undefined };
}

/** "Nearest X" points: name and straight-line distance, or `none` when nothing is near. */
const nearest = (what: string, none: string): Rule => (d) => {
  if (d.value == null) return [4, `Det er ${none} i luftlinje`];
  const { head, bracket } = splitDisplay(d.display);
  const rank = d.effect === "bad" ? 4 : 6;
  return [rank, bracket ? `${what} er ${bracket}, ${head} unna i luftlinje` : `${what} er ${head} unna i luftlinje`];
};

/** SSB numbers: display is "728 714 (2026)" or "635 200 kr (2024)". */
const yearly = (sentence: (value: string, year: string) => string): Rule => (d) => {
  const { head, bracket } = splitDisplay(d.display);
  return [6, sentence(head.replace(/ kr$/, ""), bracket ?? "")];
};

const RULES: Record<string, Rule> = {
  soilType: (d) => (d.warning ? [3, `Grunnen består av ${d.display}, som er marin leire`] : [6, `Grunnen består av ${d.display}`]),
  radon: (d) =>
    d.warning
      ? [rankOf(d, 2), "Adressen ligger i et område med høy aktsomhet for radon"]
      : [5, "Adressen ligger i et område med moderat til lav aktsomhet for radon"],
  quickClay: (d) => {
    if (d.warning) return [rankOf(d, 1), `Eiendommen ligger i en faresone for kvikkleireskred med ${d.value} faregrad`];
    // Not in FACTS.md yet: NVE zone with faregrad 'Ingen'.
    if (d.value === "ingen") return [6, "Eiendommen ligger i en kartlagt sone for kvikkleire uten oppgitt faregrad"];
    return [5, "Eiendommen ligger ikke i en kartlagt faresone for kvikkleireskred"];
  },
  flood200: (d) =>
    d.warning
      ? [rankOf(d, 2), `Eiendommen ligger i en flomsone som kan bli oversvømt ved en ${d.value}-årsflom`]
      : [5, "Eiendommen ligger ikke i en kartlagt flomsone"],
  rockfall: (d) =>
    d.warning
      ? [rankOf(d, 2), "Eiendommen ligger i et aktsomhetsområde for steinsprang"]
      : [5, "Eiendommen ligger ikke i et aktsomhetsområde for steinsprang"],
  roadNoise: (d) =>
    d.value === "rød"
      ? [rankOf(d, 2), "Adressen ligger i rød støysone fra vei, med over 65 dB"]
      : d.value === "gul"
        ? [rankOf(d, 3), "Adressen ligger i gul støysone fra vei, med 55–65 dB"]
        : [5, "Adressen ligger ikke i en støysone fra riks- eller fylkesvei"],
  roadNoiseStrategic: (d) => [
    rankOf(d, Number(d.value) >= 55 ? 4 : 6),
    `Adressen har beregnet veistøy på ${d.display} i det strategiske støykartet`,
  ],
  pollutedGround: (d) =>
    d.warning
      ? [rankOf(d, 3), `Det er registrert forurenset grunn ${d.value} meter fra adressen`]
      : [5, "Det er ikke registrert forurenset grunn innen 100 meter fra adressen"],
  transitStop: nearest("Nærmeste holdeplass", "ingen holdeplass innen 2 km"),
  school: nearest("Nærmeste grunnskole", "ingen grunnskole innen 5 km"),
  kindergarten: nearest("Nærmeste barnehage", "ingen barnehage innen 3 km"),
  trails: nearest("Nærmeste registrerte tursti eller skiløype", "ingen registrert tursti eller skiløype innen 3 km"),
  municipality: (d) => {
    const { head, bracket } = splitDisplay(d.display);
    return [6, `Adressen ligger i ${bracket && bracket !== head ? d.display : head}`];
  },
  population: yearly((v, y) => `Kommunen hadde ${v} innbyggere i ${y}`),
  medianIncome: yearly((v, y) => `Medianinntekten etter skatt for husholdninger i kommunen var ${v} kr i ${y}`),
};

/** Data points with no rule yet (new in datapoints.ts, not in FACTS.md): one plain sentence. */
const fallback: Rule = (d) => [
  d.warning ? SEVERITY_RANK[d.warning.severity] : d.effect === "bad" ? 4 : d.effect === "good" ? 5 : 6,
  `${d.warning?.text ?? d.label}: ${d.display}`,
];

const MISSING: Record<MissingDataPoint["reason"], (labels: string) => string> = {
  notLoaded: (l) => `Vi har ikke data om ${l} ennå.`,
  noCoverage: (l) => `Kildene har ingen data om ${l} for dette stedet.`,
  sourceUnavailable: (l) => `Data om ${l} var ikke tilgjengelig da sammendraget ble laget.`,
};

/** "a, b og c" */
const joinOg = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`);

export function facts(p: Profile): Fact[] {
  const owner = new Map(p.sources.map((s) => [s.id, s.owner]));
  const out: (Fact & { rank: number })[] = [];

  for (const c of p.categories) {
    for (const d of c.dataPoints) {
      const [rank, sentence] = (RULES[d.id] ?? fallback)(d);
      out.push({
        text: `${sentence} (${owner.get(d.source) ?? d.source}).`,
        ...(d.warning && { severity: d.warning.severity }),
        dataPointId: d.id,
        rank,
      });
    }
  }

  const missing = p.categories.flatMap((c) => c.missing);
  for (const reason of Object.keys(MISSING) as MissingDataPoint["reason"][]) {
    const labels = missing.filter((m) => m.reason === reason).map((m) => m.label.toLowerCase());
    if (labels.length) out.push({ text: MISSING[reason](joinOg(labels)), rank: 7 });
  }

  out.sort((a, b) => a.rank - b.rank); // stable: same rank keeps the profile's category order
  const r = p.rating;
  const rating =
    r.status === "ok"
      ? `Samlet karakter er ${r.score} av 100.${r.weakestCategory ? ` Svakest er ${r.weakestCategory.name.toLowerCase()} med ${r.weakestCategory.score}.` : ""}`
      : r.reason!;
  return [...out.map(({ rank, ...f }) => f), { text: rating }];
}

const SYSTEM = `Du skriver et kort sammendrag om en adresse i Norge for folk som vurderer å bo der.
Skriv 4–6 setninger på enkel norsk bokmål. Bruk bare faktaene du får, ingen egen kunnskap.
Faktaene står i rekkefølge etter hvor alvorlige de er. Følg den rekkefølgen, og nevn alle advarsler.
Ikke gi råd, og ikke bruk vurderende ord som "farlig", "trygt", "bra" eller "dårlig".
Ikke si at det ikke finnes andre farer. Si bare hva som er sjekket og hva som ble funnet.
Behold nøyaktig nivå (faregrad, støysone, årsflom), "kartlagt", "i luftlinje" og "i kommunen" der faktaene sier det.
Samle manglende data i én kort setning. Ikke finn på tall, steder eller farer.
Ikke skriv kildene i parentes: de vises under teksten.
Svar bare med sammendraget, uten overskrift eller punktliste.`;

let client: Anthropic | undefined;

async function writeWithAi(address: string, list: Fact[]): Promise<string | undefined> {
  try {
    client ??= new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Adresse: ${address}\n\nFakta:\n${list.map((f) => `- ${f.text}`).join("\n")}` }],
    });
    if (res.stop_reason !== "end_turn") {
      console.error(`summary: stop_reason ${res.stop_reason}, using fact sentences`);
      return undefined;
    }
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    return text || undefined;
  } catch (err) {
    // Any failure falls back to the fact sentences; log why.
    if (err instanceof Anthropic.AuthenticationError) console.error("summary: invalid ANTHROPIC_API_KEY");
    else if (err instanceof Anthropic.APIError) console.error(`summary: API error ${err.status}: ${err.message}`);
    else console.error(`summary: ${(err as Error).message}`);
    return undefined;
  }
}

export async function buildSummary(id: string): Promise<Summary> {
  const profile = await buildProfile(id);
  const list = facts(profile);
  const hash = createHash("sha256").update(JSON.stringify({ MODEL, SYSTEM, list })).digest("hex").slice(0, 16);
  const addressId = profile.address.id;

  const [hit] = await query<{ text: string; model: string; created: string }>(
    "SELECT text, model, strftime(created, '%Y-%m-%dT%H:%M:%SZ') AS created FROM summaries WHERE address_id = $1 AND facts_hash = $2",
    [addressId, hash],
  );
  if (hit) return { addressId, text: hit.text, aiGenerated: true, model: hit.model, created: hit.created, facts: list };

  const text = await writeWithAi(`${profile.address.text}, ${profile.address.postcode} ${profile.address.place}`, list);
  if (!text) return { addressId, text: list.map((f) => f.text).join(" "), aiGenerated: false, facts: list };

  const created = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  await query("INSERT OR REPLACE INTO summaries VALUES ($1, $2, $3, $4, $5::TIMESTAMP)", [addressId, hash, text, MODEL, created]);
  return { addressId, text, aiGenerated: true, model: MODEL, created, facts: list };
}
