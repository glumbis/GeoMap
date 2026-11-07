// Address page: top bar, left column (summary + category cards), map on the right. Layout: docs/DESIGN.md.
// Renders whatever the profile contains (docs/PROFILE.md). Never a hard-coded category list, never a fake number.
import { h, titleCase } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { showMap } from "./map";
import { summaryCard } from "./summary";
import { audienceSection } from "./audience";
import { shareActions } from "./share";
import type { Category, DataPoint, Missing, Profile, Rating, Severity } from "./profile";

let current = 0; // ignore responses for an address we already left

export async function renderAddress(app: HTMLElement, id: string) {
  const req = ++current;
  app.className = "page-address";

  const logo = h("a", { href: "/", class: "topbar-logo", "aria-label": "Til forsiden" }, h("img", { src: "/logo-mark.png", alt: "" }), h("span", {}, "Omnium"));
  logo.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });

  const panel = h("section", { class: "panel", "aria-live": "polite" }, loading());
  const mapEl = h("div", { class: "map" });
  app.replaceChildren(
    h("header", { class: "topbar" }, logo, createSearch({ size: "compact", onPick: (hit) => navigate(`/a/${hit.id}`) })),
    h("div", { class: "address-layout" }, panel, mapEl),
  );

  let profile: Profile;
  try {
    const res = await fetch(`/api/address/${encodeURIComponent(id)}/profile`);
    const body = await res.json().catch(() => null);
    if (req !== current) return;
    if (!res.ok) return panel.replaceChildren(errorState(res.status, body?.message));
    profile = body;
  } catch {
    if (req !== current) return;
    return panel.replaceChildren(errorState(0));
  }

  const a = profile.address;
  a.place = titleCase(a.place);
  a.municipality = titleCase(a.municipality);
  document.title = `${a.text}, ${a.place} · Omnium`;
  panel.replaceChildren(
    summary(profile),
    audienceSection(profile) ?? "",
    summaryCard(id, () => req === current),
    ...profile.categories.map((c) => categoryCard(c, profile)),
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
  const r = p.rating;
  return h(
    "div",
    { class: "summary" },
    h("h1", { class: `address-title${a.text.length > 20 ? " is-long" : ""}` }, a.text),
    h("p", { class: "address-sub" }, `${a.postcode} ${a.place} · ${a.municipality} kommune`),
    shareActions(),
    overall(r),
    p.warnings.length ? warnings(p) : null,
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

function overall(r: Rating) {
  const ok = r.status === "ok" && r.score != null;
  const capped = ok && !!r.cappedBy?.length;
  const cov =`basert på ${r.coverage.present} av ${r.coverage.expected} datapunkter`;
  const weakest = r.weakestCategory && (!ok || r.weakestCategory.score < r.score!) ? r.weakestCategory : undefined;
  return h(
    "div",
    { class: "overall" },
    ring(ok ? r.score : undefined),
    h(
      "div",
      { class: "overall-text" },
      // A capped score never gets a word like "God" (docs/PROFILE.md): the worst cap reason takes its place.
      h("div", { class: "overall-word" }, !ok ? "Kan ikke vurderes" : capped ? r.cappedBy![0].text : scoreWord(r.score!)),
      !ok && r.reason ? h("p", { class: "overall-reason" }, r.reason) : null,
      weakest ? h("p", { class: "overall-weakest" }, "Svakest: ", h("strong", {}, `${weakest.name} ${weakest.score}`)) : null,
      capped
        ? h(
            "p",
            { class: "overall-cap" },
            `Begrenset til ${r.score} på grunn av dette` +
              (r.cappedBy!.length > 1 ? `, og: ${r.cappedBy!.slice(1).map((c) => c.text).join("; ")}` : ""),
          )
        : null,
      h("p", { class: "overall-coverage" }, cov),
    ),
  );
}

const SEVERITY_WORD: Record<Severity, string> = { high: "Alvorlig", medium: "Viktig", low: "Merk" };

function warnings(p: Profile) {
  return h(
    "ul",
    { class: "warnings" },
    ...p.warnings.slice(0, 3).map((w) => {
      const btn = h(
        "button",
        { class: `warning warning--${w.severity}`, type: "button" },
        h("span", { class: "dot" }),
        h("span", { class: "warning-sev" }, SEVERITY_WORD[w.severity]),
        h("span", { class: "warning-text" }, w.text),
      );
      btn.addEventListener("click", () => openDataPoint(w.categoryId, w.dataPointId));
      return h("li", {}, btn);
    }),
  );
}

function openDataPoint(categoryId: string, dataPointId: string) {
  const card = document.getElementById(`cat-${categoryId}`) as HTMLDetailsElement | null;
  if (card) card.open = true;
  const row = document.getElementById(`dp-${dataPointId}`);
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
  return h(
    "li",
    { class: "dp", id: `dp-${d.id}` },
    // "Ikke kartlagt her" is not data saying safe: same grey as missing data, never green.
    d.value === "ikkeKartlagt"
      ? h("span", { class: "dot", style: "background: var(--unknown)", title: "ikke kartlagt" })
      : h("span", { class: `dot dot--${d.effect}`, title: d.effect }),
    h(
      "div",
      { class: "dp-body" },
      h("div", { class: "dp-line" }, h("span", { class: "dp-label" }, d.label), h("span", { class: "dp-value" }, d.unit ? `${d.display} ${d.unit}` : d.display)),
      d.explanation ? h("p", { class: "dp-expl" }, d.explanation) : null,
      h("p", { class: "dp-source" }, `Kilde: ${sourceName(p, d.source)}`),
    ),
  );
}

const MISSING_WHY: Record<Missing["reason"], string> = {
  notLoaded: "Ikke lastet inn ennå",
  noCoverage: "Kilden dekker ikke denne adressen",
  sourceUnavailable: "Kilden svarer ikke nå",
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
    "footer",
    { class: "sources" },
    h("h2", {}, "Kilder"),
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
