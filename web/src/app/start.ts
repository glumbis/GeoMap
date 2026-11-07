// Minimal start page: the Omnium logo, address search and a link to the map.
import { h } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { destroyMap } from "./map";
import { logoMark } from "./logo";
import "./start.css";

export function renderStart(app: HTMLElement) {
  destroyMap();
  document.title = "Omnium";
  app.className = "page-start";

  const search = createSearch({
    size: "large",
    autofocus: true,
    onLoadingChange: (loading) => logo.classList.toggle("is-searching", loading),
    onPick: (hit) => navigate(`/a/${hit.id}`),
  });

  const mapLink = h("a", { class: "start-btn", href: "/kart" }, "Gå til kartet ", h("span", { "aria-hidden": "true" }, "→"));
  mapLink.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate("/kart");
  });

  const logo = h(
    "h1",
    { class: "start-logo" },
    logoMark("start-mark"),
    h("span", { class: "start-word" }, "Omnium"),
  );
  const actions = h("div", { class: "start-actions" }, mapLink);
  const uses = usesLine(search);

  const disclaimer = h(
    "p",
    { class: "start-disclaimer" },
    "Omnium samler åpne, offentlige data. Vi kan ikke garantere at alt er riktig, fullstendig eller oppdatert, ",
    "og tar ikke ansvar for valg du tar ut fra det. Sjekk med kilden, kommunen eller fagfolk før viktige beslutninger.",
  );

  // The result list floats under the field; this spacer takes its height with a short transition, so the map link
  // glides down instead of jumping on every letter. The logo and the field never move (start.css anchors the column).
  const spacer = h("div", { class: "start-results-space", "aria-hidden": "true" });
  const list = search.querySelector<HTMLElement>(".search-list");
  if (list) new ResizeObserver(() => {
      spacer.style.height = list.hidden ? "0px" : `${list.offsetHeight + parseFloat(getComputedStyle(list).marginTop)}px`;
    }).observe(list);

  const bg = background();
  app.replaceChildren(bg, h("main", { class: "start" }, h("div", { class: "start-content" }, logo, uses, search, spacer, actions), disclaimer));
  followPointer(app);
}

// "Brukes av <hvem> til <hva>": who uses Omnium and for what. The two changing parts flick through many pairs fast,
// then stop on one for a moment. Each pair makes sense on its own when it stops.
const USES: [string, string][] = [
  ["boligkjøpere", "å sjekke grunnen før bud"],
  ["meglere", "å svare før visningen"],
  ["utbyggere", "å finne trygg byggegrunn"],
  ["barnefamilier", "å finne skole og barnehage"],
  ["pendlere", "å sjekke bussen hjem"],
  ["arkitekter", "å planlegge fundamentet"],
  ["leietakere", "å unngå støy om natta"],
  ["banker", "å vurdere pant"],
  ["forsikringsselskaper", "å se flomfaren"],
  ["kommuner", "å se faresoner samlet"],
  ["journalister", "å grave i offentlige data"],
  ["seniorer", "å finne lege og butikk nær"],
  ["studenter", "å finne et rolig sted"],
  ["huseiere", "å måle radon i tide"],
];
const ROLL_ITEMS = 12; // words that scroll past before it stops
const ROLL_MS = 1300; // one roll: fast at first, easing to a stop
const HOLD_MS = 2600; // how long a pair stays

/**
 * The line sits between the logo and the field. The static words are in their own grid column, right-aligned against
 * the centre, and the changing words start at the centre, so nothing shifts sideways as the words change.
 * The changing words scroll up like a slot machine: a column of words slides past in one eased transition and stops
 * on the next pair. It fades out (keeping its space, so nothing moves) while the field has text.
 */
function usesLine(search: HTMLElement): HTMLElement {
  const whoSlot = h("span", { class: "uses-slot", "aria-hidden": "true" });
  const whatSlot = h("span", { class: "uses-slot", "aria-hidden": "true" });
  const line = h(
    "p",
    { class: "start-uses" },
    h("span", { class: "sr-only" }, `Brukes av ${USES.map((u) => u[0]).join(", ")}, til alt fra å sjekke grunnen til å finne skole.`),
    h("span", { class: "uses-fixed", "aria-hidden": "true" }, "Brukes av"),
    whoSlot,
    h("span", { class: "uses-fixed", "aria-hidden": "true" }, "til"),
    whatSlot,
  );
  const track = (words: string[]) => h("span", { class: "uses-track" }, ...words.map((w) => h("span", { class: "uses-var" }, w)));
  whoSlot.append(track([USES[0][0]]));
  whatSlot.append(track([USES[0][1]]));

  /** Scroll a slot from its current word through `fill` to `to`. Both slots get the same pairs, so every row reads right. */
  const roll = (slot: HTMLElement, part: 0 | 1, fill: number[], to: string, delay: number) => {
    const from = slot.textContent ?? "";
    const t = track([from, ...fill.map((k) => USES[k][part]), to]);
    slot.replaceChildren(t);
    t.style.transition = `transform ${ROLL_MS}ms cubic-bezier(0.15, 0.6, 0.2, 1) ${delay}ms`;
    t.addEventListener("transitionend", () => slot.replaceChildren(track([to])), { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => (t.style.transform = `translateY(${-(ROLL_ITEMS - 1) * 1.5}em)`)));
  };

  const input = search.querySelector("input");
  const sync = () => line.classList.toggle("is-hidden", !!input?.value.trim());
  input?.addEventListener("input", sync);

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let i = 0;
    const step = () => {
      if (!line.isConnected) return; // left the page
      if (!document.hidden && !line.classList.contains("is-hidden")) {
        i = (i + 1) % USES.length;
        const fill = Array.from({ length: ROLL_ITEMS - 2 }, () => Math.floor(Math.random() * USES.length));
        roll(whoSlot, 0, fill, USES[i][0], 0);
        roll(whatSlot, 1, fill, USES[i][1], 0);
      }
      window.setTimeout(step, ROLL_MS + HOLD_MS);
    };
    window.setTimeout(step, HOLD_MS);
  }
  return line;
}

// Faint shapes behind the page. Each has a depth: deeper ones move more with the mouse (start.css), which gives a little parallax.
const SHAPES: { cls: string; x: number; y: number; size: number; depth: number }[] = [
  { cls: "ring", x: 12, y: 22, size: 7, depth: 1.6 },
  { cls: "ring ring--orange", x: 84, y: 30, size: 4.5, depth: 2.4 },
  { cls: "dot", x: 22, y: 72, size: 1.25, depth: 3.2 },
  { cls: "dot dot--orange", x: 74, y: 78, size: 0.875, depth: 4 },
  { cls: "ring ring--dashed", x: 66, y: 12, size: 10, depth: 1 },
  { cls: "dot", x: 90, y: 60, size: 0.625, depth: 4.6 },
  { cls: "ring", x: 6, y: 88, size: 5, depth: 2 },
  { cls: "dot dot--orange", x: 34, y: 10, size: 0.75, depth: 3.6 },
];

function background() {
  return h(
    "div",
    { class: "start-bg", "aria-hidden": "true" },
    ...SHAPES.map((s) =>
      h("span", { class: `start-shape start-shape--${s.cls.split(" ").join(" start-shape--")}`, style: `left:${s.x}%;top:${s.y}%;--size:${s.size}rem;--depth:${s.depth}` }),
    ),
  );
}

/** Background shapes lean toward the mouse (CSS vars --mx/--my from -1 to 1), and a click sends a soft ripple out. */
let following = false;
function followPointer(app: HTMLElement) {
  if (following || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  following = true; // #app outlives the page, so one set of listeners is enough; they only act while the start page is shown
  app.addEventListener("pointerdown", (e) => {
    const bg = app.querySelector<HTMLElement>(":scope > .start-bg");
    if (bg) ripple(bg, e);
  });
  let frame = 0;
  app.addEventListener("pointermove", (e) => {
    if (!app.classList.contains("page-start")) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      app.style.setProperty("--mx", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      app.style.setProperty("--my", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
    });
  });
}

function ripple(bg: HTMLElement, e: PointerEvent) {
  const r = h("span", { class: "start-ripple", style: `left:${e.clientX}px;top:${e.clientY}px` });
  r.addEventListener("animationend", () => r.remove());
  bg.append(r);
}
