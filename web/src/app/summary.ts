// The summary card on the address page: GET /api/address/<id>/summary (PLAN.md -> "AI summary").
// The profile renders first; this card shows a skeleton and fills in when the summary arrives (the AI call can take seconds).
// "AI-generert" is shown ONLY when aiGenerated is true. Otherwise the API sent the plain fact sentences, and we say so.
import { h } from "./dom";

interface Fact {
  text: string;
  severity?: "high" | "medium" | "low";
  dataPointId?: string;
}

interface Summary {
  addressId: string;
  text: string;
  aiGenerated: boolean;
  model?: string;
  created?: string;
  facts: Fact[];
}

/** Returns the card at once; fills it when the summary arrives. `stillHere()` is false once the user has moved on. */
export function summaryCard(id: string, stillHere: () => boolean): HTMLElement {
  const card = h(
    "section",
    { class: "ai", "aria-busy": "true", "aria-label": "Sammendrag" },
    h("div", { class: "ai-head" }, h("h2", { class: "ai-title" }, "Sammendrag")),
    h("div", { class: "sk sk-line" }),
    h("div", { class: "sk sk-line" }),
    h("div", { class: "sk sk-line sk-line--short" }),
  );
  load(card, id, stillHere);
  return card;
}

async function load(card: HTMLElement, id: string, stillHere: () => boolean) {
  let s: Summary;
  try {
    const res = await fetch(`/api/address/${encodeURIComponent(id)}/summary`);
    if (!res.ok) throw new Error(String(res.status));
    s = await res.json();
  } catch {
    if (!stillHere()) return;
    card.removeAttribute("aria-busy");
    card.replaceChildren(
      h("div", { class: "ai-head" }, h("h2", { class: "ai-title" }, "Sammendrag")),
      h("p", { class: "ai-note" }, "Sammendraget er ikke tilgjengelig akkurat nå."),
    );
    return;
  }
  if (!stillHere()) return;

  card.removeAttribute("aria-busy");
  const head = h(
    "div",
    { class: "ai-head" },
    h("h2", { class: "ai-title" }, "Sammendrag"),
    s.aiGenerated ? h("span", { class: "ai-badge", title: s.model ? `Skrevet av ${s.model}` : undefined }, "AI-generert") : null,
  );

  if (s.aiGenerated) {
    card.replaceChildren(
      head,
      ...paragraphs(s.text).map((p) => h("p", { class: "ai-text" }, p)),
      h("p", { class: "ai-note" }, "Skrevet av AI ut fra faktaene under. Sjekk kildene før du tar viktige valg."),
      ...(s.facts.length ? [factsList(s.facts)] : []),
    );
    return;
  }

  // No AI text: the API sent the fact sentences (most serious first). One long paragraph of ~20 sentences is
  // unreadable, so show the first few as a list and the rest behind "Vis alle".
  const TOP = 4;
  const top = s.facts.slice(0, TOP);
  const rest = s.facts.slice(TOP);
  card.replaceChildren(
    head,
    h("ul", { class: "fact-list" }, ...top.map(factItem)),
    ...(rest.length
      ? [h("details", { class: "ai-facts" }, h("summary", {}, `Vis alle (${s.facts.length})`), h("ul", { class: "fact-list" }, ...rest.map(factItem)))]
      : []),
    h("p", { class: "ai-note" }, "Faktasetninger fra datakildene"),
  );
}

const factItem = (f: Fact) => h("li", { class: f.severity ? `fact fact--${f.severity}` : "fact" }, f.text);

/** Split on blank lines; the model sometimes writes one block, sometimes several. */
const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

function factsList(facts: Fact[]) {
  return h(
    "details",
    { class: "ai-facts" },
    // Count data points, not sentences, so it matches "basert på N av M datapunkter" (missing-data and score sentences have no dataPointId).
    h("summary", {}, `Faktaene bak (${facts.filter((f) => f.dataPointId).length} datapunkter)`),
    h("ul", { class: "fact-list" }, ...facts.map(factItem)),
  );
}
