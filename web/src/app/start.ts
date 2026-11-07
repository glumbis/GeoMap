// Minimal start page: the Omnium logo, address search and a link to the map.
import { h } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { destroyMap } from "./map";
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
    h("span", { class: "start-mark", "aria-hidden": "true" }, h("img", { src: "/logo-mark.png", alt: "" })),
    h("span", { class: "start-word" }, "Omnium"),
  );
  const actions = h("div", { class: "start-actions" }, mapLink);

  app.replaceChildren(h("main", { class: "start" }, h("div", { class: "start-content" }, logo, search, actions)));
}
