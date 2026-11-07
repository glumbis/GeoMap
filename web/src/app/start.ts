// Minimal start page: the Omnium logo, address search, a link to the map and one to /finn.
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

  const finnLink = h("a", { class: "start-btn", href: "/finn" }, "Finn område for meg ", h("span", { "aria-hidden": "true" }, "→"));
  finnLink.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate("/finn");
  });

  const logo = h(
    "h1",
    { class: "start-logo" },
    logoMark("start-mark"),
    h("span", { class: "start-word" }, "Omnium"),
  );
  const actions = h("div", { class: "start-actions" }, mapLink, finnLink);

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
  app.replaceChildren(bg, h("main", { class: "start" }, h("div", { class: "start-content" }, logo, search, spacer, actions), disclaimer));
  followPointer(app);
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
