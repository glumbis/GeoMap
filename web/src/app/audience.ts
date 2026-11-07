// "Vurdering for deg": the profile's perspectives (Bo her, Bygge her, ...) as rows that open to show why the score is high or low, plus advice.
// Renders whatever perspectives the API sends (docs/PROFILE.md -> "Perspectives"). Advice only for data points that are present and low.
import "./audience.css";
import { h } from "./dom";
import type { Perspective, Profile } from "./profile";

const LOW = 50; // factor score below this can trigger advice

// Advice per data point id. Key = perspective id, or "*" for any perspective. Plain, concrete, honest.
const ADVICE: Record<string, Record<string, string>> = {
  radon: {
    living: "Mål radon i boligen (2 måneder vinterstid) før du kjøper.",
    family: "Mål radon i soverom og oppholdsrom før dere flytter inn, spesielt der barna sover.",
    building: "Planlegg radonsperre og ventilert grunn i byggingen.",
  },
  quickClay: {
    living: "Spør selger om geotekniske vurderinger, og sjekk om tidligere sikring er gjort.",
    building: "Krev geoteknisk vurdering før du graver eller bygger på.",
    "*": "Sjekk med kommunen hva som kreves av geoteknikk i faresonen.",
  },
  flood200: {
    living: "Sjekk kjeller og forsikring mot flom, og spør om tidligere vannskader.",
    building: "Legg gulv og tekniske rom over flomnivå, og sjekk kravene i kommunen.",
    family: "Sjekk om lekeplass og skoleveien ligger i flomsonen.",
  },
  stormSurge: {
    "*": "Sjekk høyden på tomten mot havnivå, og om forsikringen dekker stormflo.",
  },
  rockfall: {
    "*": "Sjekk om det er sikring mot steinsprang over tomten, og be om vurdering ved bygging.",
  },
  debrisFlow: {
    "*": "Sjekk bekker og bratt terreng i nærheten, og be om vurdering av skredfare før du bygger.",
  },
  avalanche: {
    "*": "Sjekk om tomten ligger i løp for snøskred, og om kommunen stiller krav til sikring.",
  },
  roadNoise: {
    family: "Sjekk soverom mot veien og om det finnes støyskjerming.",
    living: "Besøk boligen på dagtid i rushtiden, og sjekk om soverommene vender bort fra veien.",
  },
  roadNoiseStrategic: {
    family: "Sjekk soverom mot veien og om det finnes støyskjerming.",
    living: "Besøk boligen i rushtiden, og sjekk om soverommene vender bort fra veien.",
  },
  pollutedGround: {
    living: "Spør om grunnundersøkelser, og vær forsiktig med dyrking av mat i hagen.",
    family: "Spør om grunnundersøkelser før barna leker og dyrker i hagen.",
    building: "Be om miljøteknisk grunnundersøkelse. Forurenset masse må leveres forsvarlig.",
  },
  soilType: {
    building: "Få en grunnundersøkelse av løsmassene før du planlegger fundament.",
  },
  bedrock: {
    building: "Sjekk om det er fjell i dagen eller grunt til fjell, det påvirker graving og kostnad.",
  },
  transitDepartures: {
    commuter: "Sjekk avgangene på tidspunktene du faktisk skal reise, også kveld og helg.",
    living: "Sjekk avgangene du trenger til jobb og fritid, også kveld og helg.",
    family: "Sjekk om barna kan reise kollektivt til skole og aktiviteter.",
  },
  transitStop: {
    commuter: "Gå veien til holdeplassen og sjekk hvor lang tid den tar i praksis.",
    "*": "Gå veien til holdeplassen og sjekk hvor lang tid den tar i praksis.",
  },
  school: {
    family: "Sjekk skolekrets, skolevei og kapasitet hos kommunen.",
    "*": "Sjekk skolekrets og skolevei hos kommunen.",
  },
  kindergarten: {
    family: "Sjekk ledige plasser og opptakskrets hos kommunen.",
    "*": "Sjekk barnehageplasser og opptakskrets hos kommunen.",
  },
  trails: {
    "*": "Sjekk hvor langt det faktisk er til nærmeste tursti eller løype.",
  },
};

const adviceFor = (dpId: string, perspectiveId: string) => ADVICE[dpId]?.[perspectiveId] ?? ADVICE[dpId]?.["*"];
const scoreClass = (s: number) => (s >= 60 ? "good" : s >= 40 ? "warn" : "bad");

const UP = 80; // a factor at or above this explains why a score is high
const DOWN = 70; // a factor below this explains why a score is low

type Factor = Perspective["rating"]["factors"][number];

/** What the panel needs to know about each data point behind a factor. */
interface Info {
  display: string; // already carries the unit ("320 m", "65–70 dB")
  absent: boolean; // "no hazard here": true, but it doesn't explain why a place is good
  unmapped: boolean; // "ikke kartlagt": not data, never a plus
}

/** One row per perspective. Closed: name, what it measures, score. Open: why high, why low, advice. */
export function audienceSection(p: Profile): HTMLElement | null {
  if (!p.perspectives?.length) return null;
  const info = dataPointInfo(p);
  return h(
    "section",
    { class: "audience", "aria-labelledby": "aud-title" },
    h("h2", { class: "section-label", id: "aud-title" }, "Vurdering for deg"),
    h("div", { class: "aud-list" }, ...p.perspectives.map((x) => row(x, info))),
  );
}

function row(x: Perspective, info: Map<string, Info>) {
  const r = x.rating;
  const ok = r.status === "ok" && r.score != null;
  // Colour follows the number. What holds it down is told inside the row ("begrenser skåren"), not on every closed row.
  const el = h(
    "details",
    { class: "aud-row" },
    h(
      "summary",
      { class: "aud-head" },
      h(
        "span",
        { class: "aud-text" },
        h("span", { class: "aud-name" }, x.name),
        h("span", { class: "aud-question" }, x.question),
        // Thin data is said on the closed row too, so a 100 from 2 points doesn't look as solid as one from 20.
        ok && r.coverage.present < 3 ? h("span", { class: "aud-thin" }, `Bygger på bare ${r.coverage.present} datapunkter`) : null,
      ),
      ok
        ? // A score from fewer than 3 data points is shown muted: it is not as solid as the others.
          h("span", { class: `aud-score aud-score--${r.coverage.present < 3 ? "thin" : scoreClass(r.score!)}` }, r.score!, h("span", { class: "sr-only" }, " av 100"))
        : h("span", { class: "aud-score aud-score--none" }, "Kan ikke vurderes"),
    ),
    h("div", { class: "aud-body" }, ...body(x, info)),
  );
  // One row open at a time, so the section never grows past a screen. Done on click, not on "toggle",
  // so printing (which opens every <details>) still shows them all.
  el.querySelector("summary")!.addEventListener("click", () => {
    if (el.open) return;
    el.parentElement?.querySelectorAll<HTMLDetailsElement>("details.aud-row[open]").forEach((d) => (d.open = false));
  });
  // An opened row low in the column scrolls just enough to show its contents.
  el.addEventListener("toggle", () => {
    if (el.open) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  return el;
}

function body(x: Perspective, info: Map<string, Info>): HTMLElement[] {
  const r = x.rating;
  if (r.status !== "ok" || r.score == null) return [h("p", { class: "aud-note" }, r.reason || "For lite data til å gi en skår.")];

  const capping = new Set(r.cappedBy?.map((c) => c.dataPointId));
  const penalty = new Map(r.penalties?.map((x) => [x.dataPointId, x.points]));
  const factors = mergeNoise(r.factors.filter((f) => f.score != null && !info.get(f.dataPointId)?.unmapped));
  const down = factors.filter((f) => f.score < DOWN).sort((a, b) => a.score - b.score || b.weight - a.weight).slice(0, 3);
  const high = factors.filter((f) => f.score >= UP).sort((a, b) => b.weight - a.weight || b.score - a.score);
  const up = high.filter((f) => !info.get(f.dataPointId)?.absent).slice(0, 3);
  const absent = high.filter((f) => info.get(f.dataPointId)?.absent);

  const factorRow = (f: Factor) =>
    h(
      "li",
      { class: "aud-factor" },
      h(
        "span",
        { class: "aud-factor-label" },
        f.label,
        capping.has(f.dataPointId) ? h("span", { class: "aud-tag" }, "begrenser skåren") : null,
        penalty.has(f.dataPointId) ? h("span", { class: "aud-tag" }, `trekker ${penalty.get(f.dataPointId)} poeng ekstra`) : null,
      ),
      h("span", { class: "aud-factor-value" }, info.get(f.dataPointId)?.display ?? ""),
    );
  const head = (title: string, kind: "up" | "down") =>
    h("h3", { class: "aud-sub" }, h("span", { class: "aud-arrow", "aria-hidden": "true" }, kind === "up" ? "+" : "−"), title);

  // Always the same order: what pulls down, what pulls up, then hazards that are not here.
  const out: HTMLElement[] = [];
  if (down.length) out.push(h("div", { class: "aud-why aud-why--down" }, head("Trekker ned", "down"), h("ul", { class: "aud-factors" }, ...down.map(factorRow))));
  if (up.length) out.push(h("div", { class: "aud-why aud-why--up" }, head("Trekker opp", "up"), h("ul", { class: "aud-factors" }, ...up.map(factorRow))));
  // Hazards that are not here count, but they don't explain the place: one quiet line instead of a list.
  if (absent.length) out.push(h("p", { class: "aud-absent" }, "Ingen treff i: ", absent.map((f) => f.label).join(", ")));

  // Advice only for data points that are present in this perspective and score low.
  const lines: string[] = [];
  for (const f of down) {
    const t = f.score < LOW ? adviceFor(f.dataPointId, x.id) : undefined;
    if (t && !lines.includes(t)) lines.push(t);
    if (lines.length === 2) break; // the two most important; the PDF report has the full checklist
  }
  if (lines.length) out.push(h("h3", { class: "aud-sub" }, "Sjekk før du bestemmer deg"), h("ul", { class: "aud-advice" }, ...lines.map((t) => h("li", {}, t))));

  if (r.coverage.present >= 3) out.push(h("p", { class: "aud-note" }, `Basert på ${r.coverage.present} av ${r.coverage.expected} datapunkter.`)); // thin data is said on the closed row
  return out;
}

/** roadNoise and roadNoiseStrategic are one thing to the reader: keep the lower score, label "Veistøy". */
function mergeNoise(factors: Factor[]): Factor[] {
  const noise = factors.filter((f) => f.dataPointId === "roadNoise" || f.dataPointId === "roadNoiseStrategic");
  if (!noise.length) return factors;
  const low = noise.reduce((m, f) => (f.score < m.score ? f : m));
  return [...factors.filter((f) => !noise.includes(f)), { ...low, label: "Veistøy" }];
}

function dataPointInfo(p: Profile) {
  const m = new Map<string, Info>();
  for (const c of p.categories)
    for (const d of c.dataPoints)
      m.set(d.id, {
        display: d.display,
        absent: c.id === "hazards" || /^(ikke|ingen) /i.test(d.display),
        unmapped: d.value === "ikkeKartlagt",
      });
  return m;
}
