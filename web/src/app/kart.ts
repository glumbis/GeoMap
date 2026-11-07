// Map-only page /kart: top bar like the address page, then the full-window map with Kartlag and click-to-pick.
import { h } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { showMapOverview } from "./map";
import "./kart.css";

export function renderKart(app: HTMLElement) {
  app.className = "page-address page-kart";
  document.title = "Kart · Omnium";

  const logo = h("a", { href: "/", class: "topbar-logo", "aria-label": "Til forsiden" }, h("img", { src: "/logo-mark.png", alt: "" }), h("span", {}, "Omnium"));
  logo.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });

  const hint = h("p", { class: "kart-hint" }, "Klikk hvor som helst for å sjekke et sted");
  const mapEl = h("div", { class: "map kart-map" }, hint);
  app.replaceChildren(
    h("header", { class: "topbar" }, logo, createSearch({ size: "compact", onPick: (hit) => navigate(`/a/${hit.id}`) })),
    mapEl,
  );
  showMapOverview(mapEl);
}
