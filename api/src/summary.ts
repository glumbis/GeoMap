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
  /** 1 (most serious) to 8 (rating), see docs/FACTS.md -> "Ranks". Facts come sorted by it. */
  rank: number;
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
  soilType: (d) => {
    const soil = d.display.charAt(0).toLowerCase() + d.display.slice(1);
    return d.warning
      ? [3, `Grunnen består av ${soil}, som er marin leire`]
      : d.value === "Bart fjell"
        ? [6, "Det er bart fjell eller bare et tynt lag løsmasser på stedet"]
        : [6, `Grunnen består av ${soil}`];
  },
  bedrock: (d) => {
    // display: "Leirskifer", "Syenitt (oversiktskart)", "... , med alunskifer"
    const coarse = d.display.includes("(oversiktskart)") ? " ifølge et oversiktskart" : "";
    if (d.warning) return [rankOf(d, 3), `Berggrunnen på stedet inneholder alunskifer${coarse}`];
    return [6, `Berggrunnen på stedet er ${String(d.value).toLowerCase()}${coarse}`];
  },
  radon: (d) => [rankOf(d, d.value === "lav" ? 5 : 6), `Adressen ligger i et område med ${d.display.toLowerCase()} for radon`],
  quickClay: (d) => {
    if (d.warning) return [rankOf(d, 1), `Eiendommen ligger i en faresone for kvikkleireskred med ${d.value} faregrad`];
    // "no mapped hazard grade", not "nothing known": an awareness area (quickClayAwareness) may still cover the address.
    if (d.value === "ikkeKartlagt") return [7, "NVE har ikke laget faresonekart for kvikkleireskred der eiendommen ligger, så det finnes ingen kartlagt faregrad her"];
    if (d.value === "ingen") return [6, "Eiendommen ligger i en kartlagt kvikkleiresone der NVE ikke har satt noen faregrad"];
    return [5, "Eiendommen ligger ikke i en kartlagt faresone for kvikkleireskred"];
  },
  flood200: (d) =>
    d.warning
      ? [rankOf(d, 2), `Eiendommen ligger i en flomsone som kan bli oversvømt ved en ${d.value}-årsflom`]
      : d.value === "ikkeKartlagt"
        ? [7, "NVE har ikke laget flomsonekart der eiendommen ligger, så det finnes ingen kartlagt flomsone her"]
        : [5, "Eiendommen ligger ikke i en kartlagt flomsone"],
  // Awareness areas are coarse "possible here, not checked" maps. Say so, so they don't read as a contradiction
  // next to "not in a mapped hazard zone" or "no hazard zone map here".
  quickClayAwareness: (d) =>
    d.value === true
      ? [3, "Eiendommen ligger i et aktsomhetsområde for kvikkleireskred, et grovt kart over hvor kvikkleire kan finnes, som ikke er en kartlagt faresone"]
      : d.value === "ikkeKartlagt"
        ? [7, "NVE har ikke vurdert aktsomhet for kvikkleireskred i området der eiendommen ligger"]
        : [5, "Eiendommen ligger ikke i et aktsomhetsområde for kvikkleireskred"],
  floodAwareness: (d) =>
    d.value === true
      ? [3, "Eiendommen ligger i et aktsomhetsområde for flom, et grovt kart over områder langs vassdrag som kan bli oversvømt, som ikke er en kartlagt flomsone"]
      : [5, "Eiendommen ligger ikke i et aktsomhetsområde for flom"],
  rockfall: (d) =>
    d.warning
      ? [rankOf(d, 2), "Eiendommen ligger i et aktsomhetsområde for steinsprang"]
      : [5, "Eiendommen ligger ikke i et aktsomhetsområde for steinsprang"],
  debrisFlow: (d) =>
    d.warning
      ? [rankOf(d, 2), "Eiendommen ligger i et aktsomhetsområde for jord- og flomskred"]
      : [5, "Eiendommen ligger ikke i et aktsomhetsområde for jord- og flomskred"],
  avalanche: (d) =>
    d.value === "medSkog"
      ? [rankOf(d, 2), "Eiendommen ligger i et aktsomhetsområde for snøskred"]
      : d.value === "utenSkog"
        ? [rankOf(d, 3), "Eiendommen ligger i et område der snøskred bare kan nå fram hvis skogen over blir borte"]
        : [5, "Eiendommen ligger ikke i et aktsomhetsområde for snøskred"],
  roadNoise: (d) =>
    d.value === "rød"
      ? [rankOf(d, 2), "Adressen ligger i rød støysone fra vei, med 65 dB eller mer"]
      : d.value === "gul"
        ? [rankOf(d, 3), "Adressen ligger i gul støysone fra vei, med 55–65 dB"]
        : [5, "Adressen ligger ikke i en støysone fra riks- eller fylkesvei"],
  roadNoiseStrategic: (d) => {
    const { head: band, bracket: year } = splitDisplay(d.display); // "65–70 dB (2021)"
    return [
      rankOf(d, Number(d.value) >= 55 ? 4 : 6),
      `Adressen har beregnet veistøy på ${band} i det strategiske støykartet${year ? ` fra ${year}` : ""}`,
    ];
  },
  pollutedGround: (d) =>
    d.warning
      ? [rankOf(d, 3), `Det er registrert et sted med mulig forurenset grunn ${d.value} meter fra adressen`]
      : [5, "Det er ikke registrert forurenset grunn innen 100 meter fra adressen"],
  transitStop: nearest("Nærmeste holdeplass", "ingen holdeplass innen 2 km"),
  transitDepartures: (d) => {
    if (!d.value) return [4, "Det går ingen kollektivavganger fra holdeplasser innen 500 meter i luftlinje på en vanlig hverdag"];
    // display: "161 avganger, 2 linjer (Jegeråsen, 212 m)"
    const lines = Number(/(\d+) linje/.exec(d.display)?.[1]);
    const stop = /\((.*), ([^,]+)\)$/.exec(d.display);
    const from = stop ? `Fra ${stop[1]}, ${stop[2]} unna i luftlinje, går` : "Innen 500 meter i luftlinje går";
    const per = lines === 1 ? "med 1 linje" : `fordelt på ${lines} linjer`;
    return [d.effect === "bad" ? 4 : 6, `${from} det ${d.value} avganger på en vanlig hverdag ${per}`];
  },
  school: nearest("Nærmeste grunnskole", "ingen grunnskole innen 5 km"),
  kindergarten: nearest("Nærmeste barnehage", "ingen barnehage innen 3 km"),
  trails: (d) => {
    // A route with no name comes back as its type ("Tursti", "Skiløype", ...): use the type in the sentence.
    const { head, bracket } = splitDisplay(d.display);
    if (d.value != null && bracket && ["Tursti", "Skiløype", "Sykkelrute", "Turrute"].includes(bracket)) {
      return [6, `Nærmeste registrerte ${bracket.toLowerCase()} er ${head} unna i luftlinje`];
    }
    return nearest("Nærmeste registrerte tursti eller skiløype", "ingen registrert tursti eller skiløype innen 3 km")(d);
  },
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
  outsideArea: () => "Adressen ligger utenfor Oslo og Akershus, og vi har bare data for Oslo og Akershus ennå.",
};

/** "a, b og c" */
const joinOg = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`);

export function facts(p: Profile): Fact[] {
  const owner = new Map(p.sources.map((s) => [s.id, s.owner]));
  const out: Fact[] = [];

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
  return [...out, { text: rating, rank: 8 }];
}

/** Fact groups the AI sees, by rank (docs/FACTS.md -> "Ranks"). The rating (rank 8) is left out: the page shows it. */
const GROUPS: [string, (rank: number) => boolean][] = [
  ["advarsler", (r) => r <= 4],
  ["sjekket_uten_funn", (r) => r === 5],
  ["beliggenhet", (r) => r === 6],
  ["mangler_data", (r) => r === 7],
];

function factsForAi(address: string, list: Fact[]): string {
  const parts = GROUPS.flatMap(([tag, has]) => {
    const xs = list.filter((f) => has(f.rank));
    return xs.length ? [`<${tag}>\n${xs.map((f) => `- ${f.text}`).join("\n")}\n</${tag}>`] : [];
  });
  return `Adresse: ${address}\n\n${parts.join("\n\n")}`;
}

const SYSTEM = `Du skriver et kort sammendrag om en adresse i Norge for folk som vurderer å bo der.
Skriv på enkel norsk bokmål. Bruk bare faktaene du får, ingen egen kunnskap.

Faktaene kommer i grupper med tagger. Taggene er bare for deg: ikke skriv tagnavn eller overskrifter i teksten.
Skriv 4–6 setninger til sammen, hver på høyst 30 ord, i denne rekkefølgen:
1. <advarsler>: én til tre setninger. Hver advarsel skal med, mest alvorlig først. Det er viktigere enn lengden. Slå sammen de minst alvorlige i én setning.
2. <sjekket_uten_funn>: én setning, for eksempel "Eiendommen ligger ikke i kartlagt faresone for kvikkleire, flom eller snøskred."
3. <beliggenhet>: én setning med kollektivtilbud og nærmeste skole eller barnehage. Hopp over resten, også grunn, berggrunn og kommunetall.
4. <mangler_data>: én kort setning, bare hvis gruppen finnes. Finnes den ikke, skriv ingenting om manglende data.
Hopp over en gruppe som ikke finnes.

Ikke gi råd, og ikke bruk vurderende ord som "farlig", "trygt", "bra" eller "dårlig".
Ikke si at det ikke finnes andre farer. Si bare hva som er sjekket og hva som ble funnet.
Aktsomhetsområde og faresone er to ulike kart: et aktsomhetsområde er grovt og betyr at faren er mulig, en faresone er kartlagt i detalj.
Begge kan gjelde samme sted uten å motsi hverandre. Skriv dem sammen så det henger logisk, for eksempel
"Eiendommen ligger i et aktsomhetsområde for kvikkleireskred, men ikke i en kartlagt faresone."
Skriv aldri at det mangler data om en fare som du allerede har nevnt et funn om.
Behold nøyaktig nivå (faregrad, støysone, årsflom), "kartlagt", "i luftlinje" og "i kommunen" der faktaene sier det.
Det finnes to støykart. Skriv alltid hvilket: "fra riks- og fylkesvei" eller "i det strategiske støykartet".
Ikke finn på tall, steder, farer eller manglende data. Ikke skriv kilder eller årstall i parentes.
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
      messages: [{ role: "user", content: factsForAi(address, list) }],
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

/** The page lists sources below the text; drop "(NGU)"-style brackets the model sometimes copies anyway. */
function dropSourceBrackets(text: string, profile: Profile): string {
  const owners = new Set(profile.sources.map((s) => s.owner));
  return text.replace(/ \(([^()]+)\)/g, (m, inner: string) => (owners.has(inner.trim()) ? "" : m));
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
  if (hit) return { addressId, text: dropSourceBrackets(hit.text, profile), aiGenerated: true, model: hit.model, created: hit.created, facts: list };

  const raw = await writeWithAi(`${profile.address.text}, ${profile.address.postcode} ${profile.address.place}`, list);
  const text = raw && dropSourceBrackets(raw, profile);
  if (!text) return { addressId, text: list.map((f) => f.text).join(" "), aiGenerated: false, facts: list };

  const created = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  await query("INSERT OR REPLACE INTO summaries VALUES ($1, $2, $3, $4, $5::TIMESTAMP)", [addressId, hash, text, MODEL, created]);
  return { addressId, text, aiGenerated: true, model: MODEL, created, facts: list };
}
