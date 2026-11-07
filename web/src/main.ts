// Entry: a tiny router for the pages in docs/DESIGN.md.
//   /          start page (logo + search)
//   /a/<id>    address page (summary, category cards, map)
//   /compare/<a>/<b>  compare two addresses
//   /kart      map only (Kartlag + click to check a place)
// Code for the pages lives in src/app/. Map layers go in src/features/ (loaded by src/app/map.ts).
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import "./theme.css";
import "./app/transitions.css";
import { renderKart } from "./app/kart";
import { renderStart } from "./app/start";
import { renderAddress } from "./app/address";
import { renderCompare } from "./app/compare";

const app = document.getElementById("app")!;

function route() {
  const m = /^\/a\/([^/]+)$/.exec(location.pathname);
  const c = /^\/compare\/([^/]+)(?:\/([^/]*))?$/.exec(location.pathname); // /compare/<a>/ : B empty
  if (m) renderAddress(app, decodeURIComponent(m[1]));
  else if (c) renderCompare(app, decodeURIComponent(c[1]), decodeURIComponent(c[2] ?? ""));
  else if (/^\/kart\/?$/.test(location.pathname)) renderKart(app);
  else renderStart(app);
}

window.addEventListener("popstate", route);
route();
