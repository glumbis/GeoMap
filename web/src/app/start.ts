// Start page (docs/DESIGN.md): an animated logo, a rolling "For <who>: <what they get>" line, one big search field
// and a quiet link to the map, on top of a live, draggable map of Oslo faded into the paper colour.
import { h } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { destroyMap } from "./map";
import { createStartMap } from "./startmap";
import "./start.css";

// "For <who>: <what they get>", one at a time. Short, plain and true to data we have or plan to have.
const SLOGANS: [who: string, what: string][] = [
  ["boligkjøpere", "kvikkleire, flom og radon før du byr"],
  ["boligeiere", "se hva som er kartlagt om din egen tomt"],
  ["byggere", "grunnforhold og løsmasser før du graver"],
  ["utbyggere", "skred- og flomfare før du kjøper tomt"],
  ["arkitekter", "fare- og grunnforhold før du tegner"],
  ["eiendomsmeglere", "et tydelig sammendrag av tomten"],
  ["takstmenn", "faresoner og grunn samlet på ett sted"],
  ["banker", "naturfare og risiko knyttet til en bolig"],
  ["forsikring", "flom, stormflo og skred ved adressen"],
  ["kommuneplanleggere", "fare, støy og grunn i ett kart"],
  ["barnefamilier", "nærmeste skole, barnehage og turstier"],
  ["leietakere", "støy og kollektivtilbud før du flytter inn"],
  ["graveentreprenører", "marin leire og alunskifer i grunnen"],
  ["borettslag", "oversikt over flom, støy og skredfare"],
  ["journalister", "åpne data om fare og grunn for en adresse"],
  ["studenter", "bussen, trikken og støynivået der du skal bo"],
];

const ROLL_MS = 350;
const EVERY_MS = 3800;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let stop: (() => void) | undefined;

function cleanup() {
  stop?.();
  stop = undefined;
}

export function renderStart(app: HTMLElement) {
  destroyMap();
  cleanup();
  document.title = "Omnium";
  app.className = "page-start";

  const mapEl = h("div", { class: "start-map", "aria-hidden": "true" });
  const roller = ideaRoller();
  const go = (path: string) => {
    cleanup();
    navigate(path);
  };
  const search = createSearch({ size: "large", autofocus: true, onPick: (hit) => go(`/a/${hit.id}`) });
  search.classList.add("start-block", "sl-in");
  const field = search.querySelector("input")!;
  const sync = () => roller.pause(document.activeElement === field || field.value.trim() !== "");
  field.addEventListener("focus", sync);
  field.addEventListener("blur", sync);
  field.addEventListener("input", sync);

  const mapLink = h("a", { class: "start-btn", href: "/kart" }, "Gå til kartet ", h("span", { "aria-hidden": "true" }, "→"));
  mapLink.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
    e.preventDefault();
    go("/kart");
  });

  const logo = h(
    "h1",
    { class: "start-logo start-block sl-in" },
    h("span", { class: "start-mark", "aria-hidden": "true" }, h("img", { src: "/logo-mark.png", alt: "" })),
    h("span", { class: "start-word" }, "Omnium"),
  );
  roller.el.classList.add("start-block", "sl-in");
  const actions = h("div", { class: "start-actions start-block sl-in" }, mapLink);
  const tagline = h("p", { class: "start-tagline start-block sl-in" }, "Alt offentlig tilgjengelig om en eiendom i Oslo og Akershus");
  [logo, roller.el, search, actions, tagline].forEach((el, i) => el.style.setProperty("--i", String(i)));

  app.replaceChildren(mapEl, h("div", { class: "start-fade", "aria-hidden": "true" }), h("main", { class: "start" }, logo, roller.el, search, actions, tagline));

  const stopMap = createStartMap(app, mapEl, (id) => go(`/a/${id}`));
  stop = () => {
    roller.stop();
    stopMap();
  };
}

/**
 * "For <who>: <what>". "For" never moves. The audience word rolls up out of a clipped window while the next one
 * rolls in from below and the window changes width smoothly; the text after the colon cross-fades just after.
 * Reduced motion: one static line.
 */
function ideaRoller() {
  const word = (t: string) => h("span", { class: "sf-word" }, t);
  let current = word(SLOGANS[0][0]);
  const who = h("b", { class: "for-who sf-who" }, current);
  const what = h("span", { class: "sf-what" }, SLOGANS[0][1]);
  const line = h("span", { class: "for-line sf-line", "aria-hidden": "true" }, "For ", who, ": ", what);
  const el = h(
    "p",
    { class: "start-for" },
    h("span", { class: "sr-only" }, `Omnium er for ${SLOGANS.map(([w, t]) => `${w}: ${t}`).join(". ")}.`),
    line,
  );

  if (reducedMotion()) return { el, stop: () => {}, pause: (_p: boolean) => {} };
  let i = 0;
  let paused = false;
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

  function roll() {
    i = (i + 1) % SLOGANS.length;
    const [nextWho, nextWhat] = SLOGANS[i];
    const old = current;
    const next = word(nextWho);
    // Freeze the window at its current width, then take both words out of the flow and measure the new one.
    who.style.width = `${who.getBoundingClientRect().width}px`;
    old.classList.add("is-abs");
    next.classList.add("is-abs", "is-in");
    who.append(next);
    const target = next.getBoundingClientRect().width;
    void who.offsetWidth; // flush so the width and the roll start from here
    who.style.width = `${target}px`;
    old.classList.add("is-leaving");
    next.classList.remove("is-in");
    current = next;
    later(() => {
      old.remove();
      next.classList.remove("is-abs");
      who.style.width = "";
    }, ROLL_MS + 30);
    // what they get: fade out, swap, fade in, a beat after the roll starts
    later(() => what.classList.add("is-out"), 120);
    later(() => {
      what.textContent = nextWhat;
      what.classList.remove("is-out");
    }, 120 + 260);
  }

  const timer = window.setInterval(() => {
    if (!paused && !document.hidden) roll();
  }, EVERY_MS);
  return {
    el,
    pause: (p: boolean) => (paused = p),
    stop: () => {
      clearInterval(timer);
      timers.forEach(clearTimeout);
    },
  };
}
