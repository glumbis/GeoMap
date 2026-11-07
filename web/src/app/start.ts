// Start page: logo, one big search field, one line of text. Nothing else (docs/DESIGN.md).
import { navigate } from "./router";
import { h } from "./dom";
import { createSearch } from "./search";
import { destroyMap } from "./map";

export function renderStart(app: HTMLElement) {
  destroyMap();
  document.title = "Omnium";
  app.className = "page-start";
  app.replaceChildren(
    h(
      "main",
      { class: "start" },
      h("img", { class: "start-logo", src: "/logo.png", alt: "Omnium" }),
      createSearch({ size: "large", autofocus: true, onPick: (hit) => navigate(`/a/${hit.id}`) }),
      h("p", { class: "start-tagline" }, "Alt offentlig tilgjengelig om en eiendom i Oslo og Akershus"),
    ),
  );
}
