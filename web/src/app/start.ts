// Start page (docs/DESIGN.md): the logo, a rolling line of things you can check, one big search field,
// all on top of a slowly drifting map of Oslo, faded into the paper colour like the window in the logo.
import { Map } from "maplibre-gl";
import { basemapStyle } from "./basemap";
import { h } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { destroyMap } from "./map";

// "Sjekk ..." + one of these, rolling. Keep them short, plain and true to data we have or plan to have.
const IDEAS = [
  "radon i grunnen",
  "støy fra veien",
  "kvikkleire under huset",
  "flomfare",
  "nærmeste skole",
  "nærmeste barnehage",
  "bussen og trikken",
  "forurenset grunn",
  "turstier og skiløyper",
  "steinsprang",
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

/** "Sjekk" + a word that rolls up like a slot machine, a new idea every 2.4 s. */
function ideaRoller() {
  const items = [...IDEAS, IDEAS[0]]; // the copy of the first lets the loop wrap without a visible jump
  const track = h("span", { class: "roller-track" }, ...items.map((t) => h("span", { class: "roller-item" }, t)));
  const el = h(
    "p",
    { class: "start-roller" },
    h("span", { class: "sr-only" }, `Sjekk ${IDEAS.join(", ")}.`),
    h("span", { "aria-hidden": "true", class: "roller-line" }, "Sjekk", h("span", { class: "roller-window" }, track)),
  );

  if (reducedMotion()) return { el, stop: () => {} };
  let i = 0;
  const timer = window.setInterval(() => {
    i++;
    track.style.transition = "transform 450ms cubic-bezier(.2,.7,.2,1)";
    track.style.transform = `translateY(${-i * 1.3}em)`;
    if (i === IDEAS.length) {
      // On the copy of the first item: snap back to the real first one, which looks identical.
      setTimeout(() => {
        track.style.transition = "none";
        track.style.transform = "translateY(0)";
        i = 0;
      }, 500);
    }
  }, 2400);
  return { el, stop: () => clearInterval(timer) };
}
