// Start page (docs/DESIGN.md): the logo, a fading line saying who Omnium is for, one big search field,
// all on top of a slowly drifting map of Oslo, faded into the paper colour like the window in the logo.
import { Map } from "maplibre-gl";
import { basemapStyle } from "./basemap";
import { h } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { destroyMap } from "./map";
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

let bg: Map | undefined;
let stop: (() => void) | undefined;

function cleanup() {
  stop?.();
  stop = undefined;
  bg?.remove();
  bg = undefined;
}

export function renderStart(app: HTMLElement) {
  destroyMap();
  cleanup();
  document.title = "Omnium";
  app.className = "page-start";

  const mapEl = h("div", { class: "start-map", "aria-hidden": "true" });
  const roller = ideaRoller();
  app.replaceChildren(
    mapEl,
    h("div", { class: "start-fade", "aria-hidden": "true" }),
    h(
      "main",
      { class: "start" },
      h("h1", { class: "start-logo" }, h("img", { src: "/logo-mark.png", alt: "" }), h("span", {}, "omnium")),
      roller.el,
      createSearch({
        size: "large",
        autofocus: true,
        onPick: (hit) => {
          cleanup();
          navigate(`/a/${hit.id}`);
        },
      }),
      h("p", { class: "start-tagline" }, "Alt offentlig tilgjengelig om en eiendom i Oslo og Akershus"),
    ),
  );

  driftingMap(mapEl);
  stop = roller.stop;
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A non-interactive map of Oslo. It is drawn ONCE, a bit larger than the screen, and the CSS animation
 * `start-drift` (style.css) slides it around on the GPU. Moving the map itself every frame (jumpTo) re-renders
 * all tiles each frame: that stuttered at ~30 fps and made the raster tiles shimmer.
 */
function driftingMap(container: HTMLElement) {
  bg = new Map({ container, style: basemapStyle(), center: [10.76, 59.92], zoom: 13.2, interactive: false, attributionControl: false });
}

/** "For <who>: <what>" that fades to the next phrase every 3 s. Reduced motion: one static line. */
function ideaRoller() {
  const who = h("b", { class: "for-who" }, SLOGANS[0][0]);
  const what = h("span", {}, SLOGANS[0][1]);
  const line = h("span", { class: "for-line", "aria-hidden": "true" }, "For ", who, ": ", what);
  const el = h(
    "p",
    { class: "start-for" },
    h("span", { class: "sr-only" }, `Omnium er for ${SLOGANS.map(([w, t]) => `${w}: ${t}`).join(". ")}.`),
    line,
  );

  if (reducedMotion()) return { el, stop: () => {} };
  let i = 0;
  let swap: number | undefined;
  const timer = window.setInterval(() => {
    line.classList.add("is-out");
    swap = window.setTimeout(() => {
      i = (i + 1) % SLOGANS.length;
      who.textContent = SLOGANS[i][0];
      what.textContent = SLOGANS[i][1];
      line.classList.remove("is-out");
    }, 200);
  }, 3000);
  return {
    el,
    stop: () => {
      clearInterval(timer);
      clearTimeout(swap);
    },
  };
}
