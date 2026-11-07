// AI summary for an address (PLAN.md -> "AI summary").
// 1. Template step: every data point, warning, missing point and rating becomes a fact sentence, most serious first.
// 2. AI step: Claude Haiku 5.5 writes 4-6 plain Norwegian sentences from those facts only.
// 3. Cached in DuckDB table `summaries`, keyed by address id + a hash of the facts (new data = new summary).
// 4. If the AI call fails (no key, API down, refusal), the fact sentences are returned instead. Never cached.
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { conn, query } from "./db.ts";
import { buildProfile, type Profile } from "./profile.ts";

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

/** Template step. Until Even's docs/FACTS.md exists, one generic sentence per data point. */
export function facts(p: Profile): Fact[] {
  const owner = new Map(p.sources.map((s) => [s.id, s.owner]));
  const severityRank = { high: 0, medium: 1, low: 2 };
  const effectRank = { bad: 3, neutral: 4, good: 5 };
  const out: (Fact & { rank: number })[] = [];

  for (const c of p.categories) {
    for (const d of c.dataPoints) {
      const src = owner.get(d.source) ?? d.source;
      out.push({
        text: d.warning ? `${d.warning.text}: ${d.display} (${src}).` : `${d.label}: ${d.display} (${src}).`,
        ...(d.warning && { severity: d.warning.severity }),
        dataPointId: d.id,
        rank: d.warning ? severityRank[d.warning.severity] : effectRank[d.effect],
      });
    }
  }
  const missing = p.categories.flatMap((c) => c.missing.map((m) => m.label.toLowerCase()));
  if (missing.length) out.push({ text: `Vi mangler data om: ${missing.join(", ")}.`, rank: 6 });

  out.sort((a, b) => a.rank - b.rank);
  const rating =
    p.rating.status === "ok"
      ? `Samlet karakter: ${p.rating.score} av 100${p.rating.weakestCategory ? `, svakest er ${p.rating.weakestCategory.name.toLowerCase()} (${p.rating.weakestCategory.score})` : ""}.`
      : p.rating.reason!;
  return [...out.map(({ rank, ...f }) => f), { text: rating }];
}

const SYSTEM = `Du skriver et kort sammendrag om en adresse i Norge for folk som vurderer å bo der.
Skriv 4–6 setninger på enkel norsk bokmål. Bruk bare faktaene du får, ingen egen kunnskap.
Nevn de mest alvorlige risikoene først, og nevn alle advarsler. Ikke gi råd.
Hvis data mangler, si kort at vi ikke vet det. Ikke finn på tall, steder eller farer.
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
  const hash = createHash("sha256").update(JSON.stringify(list)).digest("hex").slice(0, 16);
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
