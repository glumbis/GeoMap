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
    // The first two sentences only; the rest behind "Les mer", so the summary doesn't push the report and data points out of view.
    const [first, ...rest] = lead(s.text);
    const restEls = rest.map((p) => h("p", { class: "ai-text", hidden: true }, p));
    const more = rest.length ? h("button", { class: "ai-more", type: "button", "aria-expanded": "false" }, "Les mer") : null;
    more?.addEventListener("click", () => {
      const on = more.getAttribute("aria-expanded") !== "true";
      restEls.forEach((el) => (el.hidden = !on));
      more.setAttribute("aria-expanded", String(on));
      more.textContent = on ? "Vis mindre" : "Les mer";
    });
    card.replaceChildren(
      head,
      h("p", { class: "ai-text" }, first ?? s.text),
      ...restEls,
      ...(more ? [more] : []),
      // The facts behind it are the data points further down ("Alle datapunkter"), so no second list here.
      h("p", { class: "ai-note" }, "Skrevet av AI ut fra datapunktene under. Sjekk kildene før du tar viktige valg."),
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

/** First two sentences, then the rest of the text as paragraphs. */
function lead(text: string): string[] {
  const [p1 = text, ...more] = paragraphs(text);
  const sentences = p1.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [p1];
  const head = sentences.slice(0, 2).join("").trim();
  const tail = sentences.slice(2).join("").trim();
  return [head, ...(tail ? [tail] : []), ...more];
}

/** Split on blank lines; the model sometimes writes one block, sometimes several. */
const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
