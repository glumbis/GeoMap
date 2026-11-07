// "Spør megleren": questions to ask the seller, agent or kommune before a viewing or a bid, from the profile's findings.
// Written by hand per data point, never by the AI. Shown on the address page (profile.questions) and in the PDF report.
// A data point with a warning and no written question gets a plain "Spør selger eller megler om dette: ...".
// Groups come worst first (high warnings first), "Alltid lurt" last.
// A critical data point we have no data for gets "Vi kunne ikke sjekke ...", so silence is never read as safe.
import type { MissingDataPoint, PresentDataPoint } from "./profile.ts";

export interface QuestionGroup {
  /** The data point the questions come from. Left out on the last group, "Alltid lurt" (good to ask about any home). */
  dataPointId?: string;
  categoryId?: string;
  /** Data point label, e.g. "Kvikkleire faresone". */
  topic: string;
  /** What we found: the warning text, the display, or "Vi fant ikke data". Left out on "Alltid lurt". */
  finding?: string;
  items: string[];
}

const QUESTIONS: Record<string, { warn?: string[]; notMapped?: string[] }> = {
  quickClay: {
    warn: ["Er det gjort en geoteknisk vurdering av tomten, og hva sier den om områdestabilitet?", "Har kommunen stilt krav om sikringstiltak for byggesaker i området?"],
    notMapped: ["NVE har ikke kartlagt kvikkleire her. Finnes det grunnundersøkelser for tomten eller nabotomtene?"],
  },
  flood200: {
    warn: ["Har det vært vann i kjeller eller på tomten ved flom eller kraftig regn?", "Er boligen flomsikret, og hva dekker forsikringen ved flomskade?"],
    notMapped: ["NVE har ikke kartlagt flomfare her. Har det vært vann i kjelleren ved kraftig regn eller snøsmelting?"],
  },
  rockfall: { warn: ["Er det gjort en vurdering av skredfare for tomten (TEK17 § 7-3)?", "Finnes det sikring mot steinsprang, for eksempel nett eller voll?"] },
  debrisFlow: { warn: ["Er det gjort en vurdering av skredfare for tomten (TEK17 § 7-3)?", "Hvordan ledes overvann og bekker forbi huset ved store nedbørsmengder?"] },
  avalanche: { warn: ["Er det gjort en vurdering av snøskredfare for tomten (TEK17 § 7-3)?"] },
  stormSurge: { warn: ["Hvor høyt over havet ligger laveste etasje, og har det vært vann inn ved stormflo?"] },
  radon: { warn: ["Er det målt radon i boligen? Når, og hva var resultatet i Bq/m³?", "Har boligen radonsperre, radonbrønn eller annet tiltak mot radon?"] },
  soilType: { warn: ["Har bygningen setningsskader, sprekker i mur eller skjeve dører og vinduer?", "Hvordan er huset fundamentert, for eksempel på peler til fjell?"] },
  pollutedGround: { warn: ["Hva slags forurensning er registrert i nærheten, og er grunnen på tomten undersøkt?"] },
  roadNoise: { warn: ["Hvilke rom vender mot veien, og har vinduene støydempende glass?", "Finnes det støyskjerm, og er det planer om mer trafikk på veien?"] },
  roadNoiseStrategic: { warn: ["Hvilke rom vender mot veien, og har vinduene støydempende glass?", "Finnes det støyskjerm, og er det planer om mer trafikk på veien?"] },
  aircraftNoise: { warn: ["Hvor ofte går flytrafikken over boligen, og har vinduene støydempende glass?"] },
};

/** Good to ask about any home, whatever the data says: always the last group. */
const ALWAYS_ASK = [
  "Be om tilstandsrapport og les hva den sier om fukt, drenering og grunnmur.",
  "Spør kommunen om reguleringsplaner og byggesaker for nabolaget.",
];

export function questionsFor(categories: { id: string; dataPoints: PresentDataPoint[]; missing: MissingDataPoint[] }[]): QuestionGroup[] {
  const out: (QuestionGroup & { rank: number })[] = [];
  const seen = new Set<string>();
  for (const c of categories) {
    for (const d of c.dataPoints) {
      const q = QUESTIONS[d.id];
      const items = d.value === "ikkeKartlagt" ? q?.notMapped : d.warning ? (q?.warn ?? [`Spør selger eller megler om dette: ${d.warning.text.toLowerCase()}.`]) : undefined;
      const fresh = items?.filter((i) => !seen.has(i));
      if (!fresh?.length) continue;
      fresh.forEach((i) => seen.add(i));
      // Worst first: high, medium, low warnings, then checks (radon, awareness areas), then unmapped hazards.
      const rank = d.warning ? (d.warning.check ? 3 : { high: 0, medium: 1, low: 2 }[d.warning.severity]) : 4;
      out.push({ dataPointId: d.id, categoryId: c.id, topic: d.label, finding: d.warning?.text ?? d.display, items: fresh, rank });
    }
    for (const m of c.missing.filter((m) => m.importance === "critical")) {
      out.push({ dataPointId: m.id, categoryId: c.id, topic: m.label, finding: "Vi fant ikke data", items: [`Vi kunne ikke sjekke ${m.label.toLowerCase()}. Spør selger eller kommunen hva som er kjent.`], rank: 5 });
    }
  }
  const sorted: QuestionGroup[] = out.sort((a, b) => a.rank - b.rank).map(({ rank: _r, ...g }) => g);
  sorted.push({ topic: "Alltid lurt", items: ALWAYS_ASK });
  return sorted;
}
