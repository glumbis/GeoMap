// Info texts per data point, read from docs/TEXTS.md (Even owns the texts; this only reads them).
// Under each "### `<id>`" heading: the "**Forklaring:**" line is always shown, and each
// "- **Når <outcome>:**" line is shown when its rule in OUTCOMES below matches the reading.
// Bullets without "Når" are not used.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reading } from "./datapoints.ts";

const TEXTS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/TEXTS.md");

/**
 * When each "Når ..." text applies: data point id -> outcome (exactly as written after "Når" in TEXTS.md) -> rule.
 * New "Når" line in TEXTS.md = one rule here. `npm test` fails if the two lists don't match.
 */
export const OUTCOMES: Record<string, Record<string, (r: Reading) => boolean>> = {
  soilType: {
    "marin leire": (r) => r.effect === "bad",
  },
  bedrock: {
    "alunskifer": (r) => r.effect === "bad",
    "oversiktskart": (r) => r.display.includes("(oversiktskart)"),
  },
  radon: {
    "høy eller meget høy aktsomhet": (r) => r.value === "høy" || r.value === "megetHøy",
    "middels aktsomhet": (r) => r.value === "middels",
    "lav aktsomhet": (r) => r.value === "lav",
  },
  quickClay: {
    "i faresone": (r) => ["høy", "middels", "lav"].includes(String(r.value)),
    "i kartlagt sone uten faregrad": (r) => r.value === "ingen",
    "ikke i faresone (kartlagt område)": (r) => r.value === null,
    "ikke kartlagt": (r) => r.value === "ikkeKartlagt",
  },
  flood200: {
    "i flomsone": (r) => typeof r.value === "number",
    "ikke i flomsone (kartlagt område)": (r) => r.value === false,
    "ikke kartlagt": (r) => r.value === "ikkeKartlagt",
  },
  stormSurge: {
    "i stormflosone i dag": (r) => typeof r.value === "number" && r.value !== 2100,
    "bare i år 2100": (r) => r.value === 2100,
    "ikke i stormflosone": (r) => r.value === false,
  },
  rockfall: {
    "i aktsomhetsområde": (r) => r.value === true,
  },
  debrisFlow: {
    "i aktsomhetsområde": (r) => r.value === true,
  },
  avalanche: {
    "i aktsomhetsområde": (r) => r.value === "medSkog",
    "bare uten skog": (r) => r.value === "utenSkog",
  },
  roadNoise: {
    "rød sone (65 dB eller mer)": (r) => r.value === "rød",
    "gul sone (55–65 dB)": (r) => r.value === "gul",
    "ikke i støysone": (r) => r.value === null,
  },
  roadNoiseStrategic: {
    "65 dB eller mer": (r) => Number(r.value) >= 65,
    "55–65 dB": (r) => Number(r.value) >= 55 && Number(r.value) < 65,
    "50–55 dB": (r) => Number(r.value) >= 50 && Number(r.value) < 55,
  },
  aircraftNoise: {
    "rød sone (62 dB eller mer)": (r) => r.value === "rød",
    "gul sone (52–62 dB)": (r) => r.value === "gul",
    "ikke i sone": (r) => r.value === null,
  },
  pollutedGround: {
    "registrert i nærheten": (r) => r.value !== null,
  },
  energyWell: {
    "ingen brønn i nærheten": (r) => r.value === null,
  },
  protectedNature: {
    "inne i verneområdet": (r) => r.value === 0,
  },
  culturalHeritage: {
    "fredet": (r) => ["AUT", "VED", "FOR", "MID", "WHS"].includes(String(r.value)),
    "listeført eller regulert til bevaring": (r) => ["KOM", "STAT", "LIST", "PBL", "REG", "FVERN"].includes(String(r.value)),
    "uavklart vernestatus": (r) => ["UAV", "FPG", "SAM"].includes(String(r.value)),
    "ingen registrert": (r) => r.value === null,
  },
  crimeRate: {
    "Gardermoen er med": (r) => r.display.includes("Gardermoen"),
  },
  violentCrime: {
    "Gardermoen er med": (r) => r.display.includes("Gardermoen"),
  },
  transitDepartures: {
    "ingen avganger": (r) => r.value === 0,
  },
};

export interface InfoText {
  main?: string;
  /** "Når ..." texts by outcome, in file order. */
  outcomes: Map<string, string>;
}

export function parseTexts(md: string): Map<string, InfoText> {
  const out = new Map<string, InfoText>();
  let entry: InfoText | undefined;
  for (const line of md.split(/\r?\n/)) {
    const heading = /^###\s+`([^`]+)`/.exec(line);
    if (heading) {
      entry = out.get(heading[1]) ?? { outcomes: new Map() };
      out.set(heading[1], entry);
      continue;
    }
    if (!entry) continue;
    const main = /^\*\*Forklaring:\*\*\s*(.+)$/.exec(line);
    if (main && !entry.main) entry.main = main[1].trim();
    const when = /^-\s+\*\*Når\s+(.+?):\*\*\s*(.+)$/.exec(line);
    if (when) entry.outcomes.set(when[1].trim(), when[2].trim());
  }
  return out;
}

function load(): Map<string, InfoText> {
  try {
    return parseTexts(readFileSync(TEXTS_PATH, "utf8"));
  } catch {
    console.error(`texts: cannot read ${TEXTS_PATH}, data points get no info text`);
    return new Map();
  }
}

/** Read once at startup. Restart the API after editing docs/TEXTS.md. */
export const INFO_TEXTS = load();

/** The info text for one reading: the main text, then every "Når ..." text whose rule matches. */
export function infoText(id: string, reading: Reading, texts = INFO_TEXTS): string | undefined {
  const t = texts.get(id);
  if (!t) return undefined;
  const rules = OUTCOMES[id] ?? {};
  const parts = [t.main, ...[...t.outcomes].filter(([outcome]) => rules[outcome]?.(reading)).map(([, text]) => text)];
  return parts.filter(Boolean).join(" ") || undefined;
}
