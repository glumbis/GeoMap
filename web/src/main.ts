// Entry: a tiny router for the two pages in docs/DESIGN.md.
//   /          start page (logo + search)
//   /a/<id>    address page (summary, category cards, map)
// Code for the pages lives in src/app/. Map layers go in src/features/ (loaded by src/app/map.ts).
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { renderStart } from "./app/start";
import { renderAddress } from "./app/address";

const app = document.getElementById("app")!;

function route() {
  const m = /^\/a\/([^/]+)$/.exec(location.pathname);
  if (m) renderAddress(app, decodeURIComponent(m[1]));
  else renderStart(app);
}

window.addEventListener("popstate", route);
route();
