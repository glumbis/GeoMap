// "Hva betyr dette for deg?": the profile's perspectives (Bo her, Bygge her, ...) as tabs, with the top factors and tailored advice.
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

export function audienceSection(p: Profile): HTMLElement | null {
  if (!p.perspectives?.length) return null;
  const list: Perspective[] = p.perspectives;

  let selected = list[0].id; // always starts on the first tab for each address

  const uid = `aud-${Math.random().toString(36).slice(2, 7)}`;
  const tabs = h("div", { class: "aud-tabs", role: "tablist", "aria-label": "Hva betyr dette for deg?" });
  const panel = h("div", { class: "aud-panel", role: "tabpanel", tabindex: 0 });

  const buttons = list.map((x) => {
    const b = h("button", { class: "aud-tab", type: "button", role: "tab", id: `${uid}-${x.id}` }, x.name);
    b.addEventListener("click", () => select(x.id, false));
    b.addEventListener("keydown", (e) => {
      const i = list.findIndex((y) => y.id === selected);
      let n = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % list.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + list.length) % list.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = list.length - 1;
      if (n < 0) return;
      e.preventDefault();
      select(list[n].id, true);
    });
    tabs.append(b);
    return b;
  });

  function select(id: string, focus: boolean) {
    selected = id;
    list.forEach((x, i) => {
      const on = x.id === id;
      buttons[i].setAttribute("aria-selected", String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      if (on && focus) buttons[i].focus();
    });
    panel.setAttribute("aria-labelledby", `${uid}-${id}`);
    panel.replaceChildren(...body(list.find((x) => x.id === id)!, p));
  }
  select(selected, false);

  return h("section", { class: "audience" }, h("h2", { class: "aud-title" }, "Hva betyr dette for deg?"), tabs, panel);
}

function body(x: Perspective, p: Profile): HTMLElement[] {
  const r = x.rating;
  const ok = r.status === "ok" && r.score != null;
  const capped = ok && !!r.cappedBy?.length;
  const out: HTMLElement[] = [h("p", { class: "aud-question" }, x.question)];

  out.push(
    h(
      "div",
      { class: "aud-score" },
      ok ? h("span", { class: `aud-number aud-number--${capped ? "cap" : scoreClass(r.score!)}` }, r.score!, h("span", { class: "aud-of" }, "/100")) : null,
      h(
        "div",
        { class: "aud-score-text" },
        // A capped score never gets a word like "God": the worst cap reason takes its place (docs/PROFILE.md).
        !ok ? h("div", { class: "aud-word aud-word--none" }, "Kan ikke vurderes") : capped ? h("div", { class: "aud-word" }, r.cappedBy![0].text) : null,
        !ok && r.reason ? h("p", { class: "aud-note" }, r.reason) : null,
        capped ? h("p", { class: "aud-note" }, `Begrenset til ${r.score} på grunn av dette`) : null,
        ok && r.coverage.present < 3 ? h("div", { class: "aud-word aud-word--none" }, `usikker (bare ${r.coverage.present} datapunkter)`) : null,
        h("p", { class: "aud-note" }, `basert på ${r.coverage.present} av ${r.coverage.expected} datapunkter`),
      ),
    ),
  );
  if (ok && p.warnings?.some((w) => w.severity === "high")) {
    out.push(h("p", { class: "aud-note aud-merk" }, h("strong", {}, "Merk: "), `gjelder bare ${x.name.toLowerCase()}. Adressen har alvorlige advarsler.`));
  }

  if (!ok) return out;

  // roadNoise and roadNoiseStrategic are one thing to the reader: keep the lower score, label "Veistøy".
  const noise = r.factors.filter((f) => f.score != null && (f.dataPointId === "roadNoise" || f.dataPointId === "roadNoiseStrategic"));
  const factors = r.factors.filter((f) => !noise.includes(f));
  if (noise.length) {
    const low = noise.reduce((m, f) => (f.score < m.score ? f : m));
    factors.push({ ...low, label: "Veistøy" });
  }
  const weak = factors.filter((f) => f.score != null).sort((a, b) => a.score - b.score).slice(0, 3);
  const pulling = weak.filter((f) => f.score < 80);
  if (pulling.length) {
    out.push(
      h("h3", { class: "aud-sub" }, "Hva trekker ned"),
      h(
        "ul",
        { class: "aud-factors" },
        ...pulling.map((f) =>
          h("li", { class: "aud-factor" }, h("span", { class: "aud-factor-label" }, f.label), h("span", { class: `aud-factor-score aud-factor-score--${scoreClass(f.score)}` }, f.score)),
        ),
      ),
    );
  }

  // Advice only for data points that are present in this perspective and score low.
  const lines: string[] = [];
  for (const f of weak) {
    if (f.score >= LOW) break;
    const t = adviceFor(f.dataPointId, x.id);
    if (t && !lines.includes(t)) lines.push(t);
    if (lines.length === 3) break;
  }
  if (lines.length) {
    out.push(h("h3", { class: "aud-sub" }, "Sjekk før du …"), h("ul", { class: "aud-advice" }, ...lines.map((t) => h("li", {}, t))));
  }
  return out;
}
