// Address page: top bar, left column, map on the right. Layout: docs/DESIGN.md.
// Top bar: logo, search, Del / Skriv ut / Sammenlign. Left column, top to bottom: address, overall rating, warnings,
// the perspectives ("Vurdering for deg"), summary,
// PDF report, every data point by category, sources.
// Renders whatever the profile contains (docs/PROFILE.md). Never a hard-coded category list, never a fake number.
import { h, titleCase } from "./dom";
import { navigate } from "./router";
import { topbarLogo, setLogoLoading } from "./logo";
import { createSearch } from "./search";
import { showMap } from "./map";
import { summaryCard } from "./summary";
import { audienceSection } from "./audience";
import { shareActions } from "./share";
import { reportLink } from "./report";
import "./address.css";
import type { Category, DataPoint, Missing, Profile, Severity } from "./profile";

let current = 0; // ignore responses for an address we already left

export async function renderAddress(app: HTMLElement, id: string) {
  const req = ++current;
  app.className = "page-address";

  const logo = topbarLogo();

  const panel = h("section", { class: "panel", "aria-live": "polite" }, loading());
  const mapEl = h("div", { class: "map" });
  app.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      logo,
      createSearch({ size: "compact", onPick: (hit) => navigate(`/a/${hit.id}`), onLoadingChange: (on) => setLogoLoading(logo, on) }),
      shareActions(id), // Del, Skriv ut, Sammenlign: page actions live in the bar, not in the reading column
    ),
    h("div", { class: "address-layout" }, panel, mapEl),
  );

  let profile: Profile;
  setLogoLoading(logo, true); // the logo ring spins while the address loads
  try {
    const res = await fetch(`/api/address/${encodeURIComponent(id)}/profile`);
    const body = await res.json().catch(() => null);
    if (req !== current) return;
    if (!res.ok) return panel.replaceChildren(errorState(res.status, body?.message));
    profile = body;
  } catch {
    if (req !== current) return;
    return panel.replaceChildren(errorState(0));
  } finally {
    setLogoLoading(logo, false);
  }

  const a = profile.address;
  a.place = titleCase(a.place);
  a.municipality = titleCase(a.municipality);
  document.title = `${a.text}, ${a.place} · Omnium`;
  panel.replaceChildren(
    summary(profile),
    audienceSection(profile) ?? "",
    summaryCard(id, () => req === current),
    reportLink(a.id),
    h(
      "section",
      { class: "all-points", "aria-labelledby": "all-points-title" },
      h("h2", { class: "section-label", id: "all-points-title" }, "Alle datapunkter"),
      ...profile.categories.map((c) => categoryCard(c, profile)),
    ),
    sourcesBlock(profile),
  );
  // Fade the column in, one block after the other (transitions.css).
  Array.from(panel.children).forEach((el, i) => {
    el.classList.add("reveal");
    (el as HTMLElement).style.setProperty("--reveal-i", String(Math.min(i, 8)));
  });
  showMap(mapEl, a.lng, a.lat);
}

// ---------- summary ----------

function summary(p: Profile) {
  const a = p.address;
  return h(
    "div",
    { class: "summary" },
    h("h1", { class: `address-title${a.text.length > 20 ? " is-long" : ""}` }, a.text),
    h("p", { class: "address-sub" }, `${a.postcode} ${a.place} · ${a.municipality} kommune`),
    overall(p),
    p.warnings.length ? warnings(p) : null,
    p.checks?.length ? checks(p) : null,
  );
}

function scoreWord(score: number) {
  if (score >= 80) return "Svært god";
  if (score >= 60) return "God";
  if (score >= 40) return "Middels";
  return "Svak";
}

function ring(score?: number) {
  // Gradient ring like the logo; filled to the score. No score: empty grey ring with a dash.
  const C = 2 * Math.PI * 44;
  const svg = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--orange)"/><stop offset=".55" stop-color="var(--teal)"/><stop offset="1" stop-color="var(--navy)"/>
    </linearGradient></defs>
    <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" stroke-width="8"/>
    ${score != null ? `<circle class="ring-fill" cx="50" cy="50" r="44" fill="none" stroke="url(#ring-grad)" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}" style="--ring-c:${C}" transform="rotate(-90 50 50)"/>` : ""}
  </svg>`;
  const el = h("div", { class: "ring" }, h("span", { class: "ring-number" }, score != null ? score : "–"));
  el.insertAdjacentHTML("afterbegin", svg);
  return el;
}

// What each word means, in one plain sentence. The word follows the number (scoreWord).
const MEANING: Record<string, string> = {
  "Svært god": "Få kjente farer og gode forhold rundt adressen.",
  God: "Gode forhold, men noe er verdt å sjekke.",
  Middels: "Noen forhold trekker tydelig ned.",
  Svak: "Alvorlige forhold trekker skåren ned.",
};

/**
 * The big number and what it means: the word, one sentence on what the word means, one on why (what pulls it down),
 * and one quiet line on what the number is. The details are further down; this block only orients.
 */
function overall(p: Profile) {
  const r = p.rating;
  const ok = r.status === "ok" && r.score != null;
  // A capped score never gets "God" or better (docs/PROFILE.md).
  const word = ok ? scoreWord(r.cappedBy?.length ? Math.min(r.score!, 59) : r.score!) : "Kan ikke vurderes";
  // Short names: "Veistøy (strategisk støykart)" reads as "Veistøy" here.
  const label = (id: string) => p.categories.flatMap((c) => c.dataPoints).find((d) => d.id === id)?.label.replace(/\s*\(.*\)$/, "");
  // Why: what caps the score, then what costs points (radon, awareness areas). Named by data point, each once.
  const down = [...new Set([...(r.cappedBy ?? []), ...(r.penalties ?? [])].map((x) => label(x.dataPointId)).filter((x): x is string => !!x))];
  const weakest = r.weakestCategory && ok && r.weakestCategory.score < r.score! ? r.weakestCategory : undefined;
  const why = down.length
    ? `Trekker ned: ${list(down.map((x, i) => (i ? x.toLowerCase() : x)))}.`
    : weakest
      ? `Svakest er ${weakest.name.toLowerCase()} (${weakest.score}).`
      : null;
  return h(
    "div",
    { class: "overall" },
    ring(ok ? r.score : undefined),
    h(
      "div",
      { class: "overall-text" },
      h("div", { class: "overall-word" }, word),
      ok ? h("p", { class: "overall-meaning" }, MEANING[word]) : r.reason ? h("p", { class: "overall-meaning" }, r.reason) : null,
      ok && why ? h("p", { class: "overall-why" }, why) : null,
      h("p", { class: "overall-coverage" }, `Skår 0–100 fra ${r.coverage.present} av ${r.coverage.expected} offentlige datapunkter.`),
    ),
  );
}

/** "a, b og c" */
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`);

const SEVERITY_WORD: Record<Severity, string> = { high: "Alvorlig", medium: "Viktig", low: "Merk" };

const WARNINGS_SHOWN = 3; // most serious first; the rest wait behind "Vis N advarsler til" (never hide just one)

function warnings(p: Profile) {
  const item = (w: Profile["warnings"][number]) => {
    const btn = h(
      "button",
      { class: `warning warning--${w.severity}`, type: "button" },
      h("span", { class: "dot" }),
      h("span", { class: "warning-sev" }, SEVERITY_WORD[w.severity]),
      h("span", { class: "warning-text" }, w.text),
    );
    btn.addEventListener("click", () => openDataPoint(w.categoryId, w.dataPointId));
    return h("li", {}, btn);
  };
  const items = p.warnings.map(item);
  const list = h("ul", { class: "warnings", "aria-label": "Advarsler" }, ...items);
  if (items.length <= WARNINGS_SHOWN + 1) return list;
  const rest = items.slice(WARNINGS_SHOWN);
  const label = `Vis ${rest.length} ${rest.length === 1 ? "advarsel" : "advarsler"} til`;
  const more = h("button", { class: "warnings-more", type: "button", "aria-expanded": "false" }, label);
  const show = (on: boolean) => {
    rest.forEach((li) => (li.hidden = !on));
    more.setAttribute("aria-expanded", String(on));
    more.textContent = on ? "Vis færre" : label;
  };
  more.addEventListener("click", () => {
    const on = more.getAttribute("aria-expanded") !== "true";
    show(on);
    if (on) rest[0].querySelector("button")?.focus(); // keyboard users land on the first new warning
  });
  show(false);
  return h("div", { class: "warnings-block" }, list, more);
}

// What to do about each check, in a few words.
const CHECK_ACTION: Record<string, string> = {
  radon: "Mål radon i boligen, helst om vinteren.",
  quickClayAwareness: "Spør om grunnundersøkelse før graving eller tilbygg.",
  floodAwareness: "Spør om vann i kjeller før, og sjekk forsikringen.",
};

/** "Sjekk dette": common findings that don't cap the score, how common they are in the municipality, and what to do. */
function checks(p: Profile) {
  return h(
    "div",
    { class: "checks" },
    h("h2", { class: "checks-title" }, "Sjekk dette"),
    h(
      "ul",
      { class: "checks-list" },
      ...p.checks!.map((c) => {
        const btn = h(
          "button",
          { class: "check", type: "button" },
          h("span", { class: "check-text" }, c.text),
          // What to do, then how common it is around here (so it reads as the area, not this plot only).
          h(
            "span",
            { class: "check-action" },
            [CHECK_ACTION[c.dataPointId], c.areaShare ? `${c.areaShare.percent} % av ${titleCase(c.areaShare.municipality)} har det samme.` : ""].filter(Boolean).join(" "),
          ),
        );
        btn.addEventListener("click", () => openDataPoint(c.categoryId, c.dataPointId));
        return h("li", {}, btn);
      }),
    ),
  );
}

function openDataPoint(categoryId: string, dataPointId: string) {
  const card = document.getElementById(`cat-${categoryId}`) as HTMLDetailsElement | null;
  if (card) card.open = true;
  const row = document.getElementById(`dp-${dataPointId}`);
  if (row instanceof HTMLDetailsElement) row.open = true;
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
  row?.classList.add("is-flash");
  setTimeout(() => row?.classList.remove("is-flash"), 1200);
}

// ---------- category cards ----------

function scoreClass(score: number) {
  return score >= 60 ? "good" : score >= 40 ? "warn" : "bad";
}

function categoryCard(c: Category, p: Profile) {
  const ok = c.rating.status === "ok" && c.rating.score != null;
  const badge = ok
    ? h("span", { class: `cat-score cat-score--${scoreClass(c.rating.score!)}` }, c.rating.score!)
    : h("span", { class: "cat-score cat-score--none" }, c.rating.status === "informational" ? "Kun fakta" : "Kan ikke vurderes");
  return h(
    "details",
    { class: "card", id: `cat-${c.id}` },
    h(
      "summary",
      { class: "card-head" },
      h("span", { class: "card-title" }, c.name),
      h("span", { class: "card-count" }, `${c.dataPoints.length} av ${c.dataPoints.length + c.missing.length}`),
      badge,
    ),
    !ok ? h("p", { class: "card-reason" }, c.rating.reason || "Ingen skår for denne kategorien ennå") : null,
    h("ul", { class: "dps" }, ...c.dataPoints.map((d) => dataPointRow(d, p)), ...c.missing.map((m) => missingRow(m, p))),
  );
}

const sourceName = (p: Profile, id: string) => {
  const s = p.sources.find((x) => x.id === id);
  return s ? `${s.owner}: ${s.name}` : id;
};

function dataPointRow(d: DataPoint, p: Profile) {
  // The row is its own toggle: label and value by default; click it for the explanation and source.
  return h(
    "li",
    { class: "dp-item" },
    h(
      "details",
      { class: "dp dp--toggle", id: `dp-${d.id}` },
      h(
        "summary",
        { class: "dp-sum" },
        // "Ikke kartlagt her" is not data saying safe: same grey as missing data, never green.
        d.value === "ikkeKartlagt" ? h("span", { class: "dot", style: "background: var(--unknown)" }) : h("span", { class: `dot dot--${d.effect}` }),
        // display already carries the unit ("65–70 dB", "320 m").
        h("span", { class: "dp-line" }, h("span", { class: "dp-label" }, d.label), h("span", { class: "dp-value" }, d.display)),
        // The data point's own score, as a number (colour is never the only signal). Facts without a score show none.
        d.score != null && d.value !== "ikkeKartlagt"
          ? h("span", { class: `dp-score dp-score--${scoreClass(d.score)}` }, d.score, h("span", { class: "sr-only" }, " av 100"))
          : h("span", { class: "dp-score dp-score--none", "aria-hidden": "true" }),
      ),
      h(
        "div",
        { class: "dp-detail" },
        d.explanation ? h("p", { class: "dp-expl" }, d.explanation) : null,
        h("p", { class: "dp-source" }, `Kilde: ${sourceName(p, d.source)}`),
      ),
    ),
  );
}

const MISSING_WHY: Record<Missing["reason"], string> = {
  notLoaded: "Ikke lastet inn ennå",
  noCoverage: "Kilden dekker ikke denne adressen",
  sourceUnavailable: "Kilden svarer ikke nå",
  outsideArea: "Utenfor Oslo og Akershus",
};

function missingRow(m: Missing, p: Profile) {
  return h(
    "li",
    { class: "dp dp--missing", id: `dp-${m.id}` },
    h("span", { class: "dot dot--missing" }),
    h(
      "div",
      { class: "dp-body" },
      h("div", { class: "dp-line" }, h("span", { class: "dp-label" }, m.label), h("span", { class: "dp-value" }, "Ikke tilgjengelig")),
      h("p", { class: "dp-source" }, `${MISSING_WHY[m.reason]} · ${sourceName(p, m.source)}`),
    ),
  );
}

function sourcesBlock(p: Profile) {
  return h(
    "details",
    { class: "sources" },
    h("summary", {}, `Kilder (${p.sources.length})`),
    h("ul", {}, ...p.sources.map((s) => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener" }, `${s.owner}: ${s.name}`), ` (${s.licence})`))),
  );
}

// ---------- states ----------

function loading() {
  return h("div", { class: "skeleton" }, h("div", { class: "sk sk-title" }), h("div", { class: "sk sk-ring" }), h("div", { class: "sk sk-card" }), h("div", { class: "sk sk-card" }), h("div", { class: "sk sk-card" }));
}

function errorState(status: number, message?: string) {
  const [title, text] =
    status === 400 || status === 404
      ? ["Fant ikke adressen", "Adressen finnes ikke, eller lenken er feil. Søk etter adressen på nytt."]
      : status === 0 || status === 502
        ? ["Får ikke kontakt med serveren", "Sjekk at API-et kjører (npm run dev), og prøv igjen."]
        : ["Noe gikk galt", message ?? "Prøv igjen om litt."];
  const retry = h("button", { class: "btn", type: "button" }, "Prøv igjen");
  retry.addEventListener("click", () => window.dispatchEvent(new PopStateEvent("popstate")));
  return h("div", { class: "state" }, h("h1", {}, title), h("p", {}, text), status !== 404 && status !== 400 ? retry : null);
}
