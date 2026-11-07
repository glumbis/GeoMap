// "Spør megleren": the profile's questions for the viewing (profile.questions, written by hand in api/src/questions.ts,
// never by the AI), as a checklist. Ticks are kept in this browser only (localStorage, per address), so a buyer can
// tick off answers at the viewing. "Kopier listen" copies it as plain text for notes or a message to the agent.
import { h } from "./dom";
import type { Profile, QuestionGroup } from "./profile";
import "./checklist.css";

const GROUPS_SHOWN = 3;

const storeKey = (id: string) => `omnium.checklist.${id}`;

function loadTicks(id: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storeKey(id)) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveTicks(id: string, ticks: Set<string>) {
  try {
    if (ticks.size) localStorage.setItem(storeKey(id), JSON.stringify([...ticks]));
    else localStorage.removeItem(storeKey(id));
  } catch {
    /* private window or blocked storage: ticks just aren't remembered */
  }
}

/** null when the profile has no questions field (older API). */
export function checklistSection(p: Profile, onOpenDataPoint: (categoryId: string, dataPointId: string) => void): HTMLElement | null {
  if (!p.questions) return null;
  const id = p.address.id;
  const ticks = loadTicks(id);
  const groups: QuestionGroup[] = p.questions;

  const count = h("span", { class: "qs-count" });
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const updateCount = () => {
    const done = groups.flatMap((g) => g.items).filter((i) => ticks.has(i)).length;
    count.textContent = done ? `${done} av ${total} sjekket` : `${total} spørsmål`;
  };

  const groupEls = groups.map((g) => {
    // A group from a data point opens that data point below; "Alltid lurt" has none.
    const head = g.dataPointId && g.categoryId
      ? h("button", { class: "qs-topic", type: "button", title: "Vis datapunktet" }, h("b", {}, g.topic), g.finding ? h("span", { class: "qs-finding" }, ` · ${g.finding}`) : null)
      : h("p", { class: "qs-topic" }, h("b", {}, g.topic));
    if (g.dataPointId && g.categoryId) head.addEventListener("click", () => onOpenDataPoint(g.categoryId!, g.dataPointId!));
    return h(
      "li",
      { class: "qs-group" },
      head,
      h(
        "ul",
        { class: "qs-items" },
        ...g.items.map((text) => {
          const box = h("input", { type: "checkbox", class: "qs-box" }) as HTMLInputElement;
          box.checked = ticks.has(text);
          box.addEventListener("change", () => {
            if (box.checked) ticks.add(text);
            else ticks.delete(text);
            saveTicks(id, ticks);
            updateCount();
          });
          return h("li", {}, h("label", { class: "qs-item" }, box, h("span", {}, text)));
        }),
      ),
    );
  });

  // Like the warnings: the first few groups, the rest behind a quiet button. "Alltid lurt" counts as a group.
  const rest = groupEls.slice(GROUPS_SHOWN);
  let more: HTMLElement | null = null;
  if (rest.length > 1) {
    const label = `Vis ${rest.length} temaer til`;
    more = h("button", { class: "qs-more", type: "button", "aria-expanded": "false" }, label);
    const show = (on: boolean) => {
      rest.forEach((el) => (el.hidden = !on));
      more!.setAttribute("aria-expanded", String(on));
      more!.textContent = on ? "Vis færre" : label;
    };
    more.addEventListener("click", () => show(more!.getAttribute("aria-expanded") !== "true"));
    show(false);
  }

  const copy = h("button", { class: "qs-copy", type: "button" }, "Kopier listen");
  copy.addEventListener("click", async () => {
    const text = [
      `Spørsmål til visning: ${p.address.text}, ${p.address.postcode} ${p.address.place}`,
      ...groups.map((g) => [``, g.finding ? `${g.topic} (${g.finding})` : g.topic, ...g.items.map((i) => `${ticks.has(i) ? "[x]" : "[ ]"} ${i}`)].join("\n")),
      ``,
      `Fra Omnium (${location.origin}/a/${id}). Spørsmålene er skrevet for hånd ut fra offentlige data, ikke av AI.`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Kopiert";
    } catch {
      copy.textContent = "Kunne ikke kopiere";
    }
    setTimeout(() => (copy.textContent = "Kopier listen"), 2000);
  });

  updateCount();
  return h(
    "section",
    { class: "qs", "aria-labelledby": "qs-title" },
    h("h2", { class: "section-label qs-head", id: "qs-title" }, h("span", {}, "Spør megleren"), count),
    h("p", { class: "qs-lead" }, "Spørsmål til visning eller før bud, ut fra funnene her. Huk av etter hvert som du får svar."),
    h("ul", { class: "qs-groups" }, ...groupEls),
    h("div", { class: "qs-actions" }, more, copy),
  );
}
