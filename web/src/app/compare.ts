// Compare page: /compare/<idA>/<idB> shows two addresses side by side (score, warnings, perspectives, small map,
// category table). Uses the same profile endpoint as the address page (docs/PROFILE.md). Missing data says "Kan ikke vurderes".
import "./compare.css";
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl } from "maplibre-gl";
import { cssVar, h, titleCase } from "./dom";
import { navigate } from "./router";
import { createSearch } from "./search";
import { basemapStyle } from "./basemap";
import type { Profile, Rating, Severity } from "./profile";

type FC = { features: unknown[] };
let current = 0; // ignore responses for a page we already left
let maps: MapLibre[] = [];
const cache = new Map<string, Profile>(); // so replacing one side doesn't refetch the other

type Result = { profile: Profile } | { error: number; message?: string };

async function load(id: string): Promise<Result> {
  const hit = cache.get(id);
  if (hit) return { profile: hit };
  try {
    const res = await fetch(`/api/address/${encodeURIComponent(id)}/profile`);
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: res.status, message: body?.message };
    const p = body as Profile;
    p.address.place = titleCase(p.address.place);
    p.address.municipality = titleCase(p.address.municipality);
    cache.set(id, p);
    return { profile: p };
  } catch {
    return { error: 0 };
  }
}

export function renderCompare(app: HTMLElement, idA: string, idB: string) {
  const req = ++current;
  app.className = "page-compare";
  maps.forEach((m) => m.remove());
  maps = [];

  const logo = h("a", { href: "/", class: "topbar-logo", "aria-label": "Til forsiden" }, h("img", { src: "/logo-mark.png", alt: "" }), h("span", {}, "Omnium"));
  logo.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });

  const ids = [idA, idB];
  const cols = ids.map((id, i) => {
    const search = createSearch({
      size: "compact",
      onPick: (hit) => navigate(i === 0 ? `/compare/${hit.id}/${idB}` : `/compare/${idA}/${hit.id}`),
    });
    search.classList.add("cmp-search");
    search.querySelector("input")!.setAttribute("placeholder", `Bytt adresse ${i === 0 ? "A" : "B"}`);
    search.querySelector("input")!.setAttribute("aria-label", `Bytt adresse ${i === 0 ? "A" : "B"}`);
    // Two searches on one page: the list ids must be unique for aria-controls.
    const list = search.querySelector(".search-list")!;
    list.id = `search-list-${i}`;
    search.querySelector("input")!.setAttribute("aria-controls", list.id);
    const body = h("div", { class: "cmp-body", "aria-live": "polite" }, skeleton());
    return { search, body, el: h("section", { class: "cmp-col" }, h("div", { class: "cmp-switch" }, h("span", { class: "cmp-tag" }, i === 0 ? "A" : "B"), search), body) };
  });

  const tableEl = h("div", { class: "cmp-table-wrap" });
  const verdictEl = h("div", { class: "cmp-verdict", "aria-live": "polite" });
  const mapCells = [h("div", { class: "cmp-mapcell" }), h("div", { class: "cmp-mapcell" })];
  app.replaceChildren(
    h("header", { class: "topbar" }, logo, h("span", { class: "cmp-heading" }, "Sammenlign adresser")),
    h("div", { class: "cmp-scroll" }, verdictEl, h("div", { class: "cmp-cols" }, cols[0].el, cols[1].el), tableEl, h("div", { class: "cmp-maps" }, mapCells[0], mapCells[1])),
  );
  document.title = "Sammenlign · Omnium";

  const results: (Result | undefined)[] = [undefined, undefined];
  ids.forEach(async (id, i) => {
    const r = await load(id);
    if (req !== current) return;
    results[i] = r;
    if ("profile" in r) fill(cols[i].body, mapCells[i], r.profile, ids[i]);
    else cols[i].body.replaceChildren(errorState(r.error, () => renderCompare(app, idA, idB)));
    const a = results[0], b = results[1];
    if (a && b && "profile" in a && "profile" in b) verdictEl.replaceChildren(...verdict(a.profile, b.profile));
    if (a && b) tableEl.replaceChildren(...(("profile" in a && "profile" in b) ? [table(a.profile, b.profile)] : [notice()]));
    if ("profile" in r && results[0] && results[1] && "profile" in results[0] && "profile" in results[1]) {
      document.title = `${results[0].profile.address.text} mot ${results[1].profile.address.text} · Omnium`;
    }
  });
}

// ---------- column ----------

const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SEV_LOWER: Record<Severity, string> = { high: "alvorlig", medium: "viktig", low: "merk" };

function worstWarning(p: Profile): HTMLElement {
  const w = [...p.warnings].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])[0];
  return h(
    "p",
    { class: `cmp-verdict-line${w ? ` cmp-verdict-line--${w.severity}` : ""}` },
    h("strong", {}, `${p.address.text}: `),
    w ? `verste advarsel ${w.text.charAt(0).toLowerCase()}${w.text.slice(1)} (${SEV_LOWER[w.severity]})` : "ingen advarsler",
  );
}

function verdict(A: Profile, B: Profile): HTMLElement[] {
  const oa = A.rating.status === "ok" ? A.rating.score : undefined;
  const ob = B.rating.status === "ok" ? B.rating.score : undefined;
  const head =
    oa != null && ob != null
      ? oa === ob
        ? "Like høy samlet score"
        : `${oa > ob ? A.address.text : B.address.text} scorer ${Math.abs(oa - ob)} poeng høyere enn ${oa > ob ? B.address.text : A.address.text}`
      : "Samlet score kan ikke sammenlignes";
  return [h("p", { class: "cmp-verdict-head" }, head), worstWarning(A), worstWarning(B)];
}

function fill(body: HTMLElement, mapCell: HTMLElement, p: Profile, id: string) {
  const a = p.address;
  const mapEl = h("div", { class: "cmp-map" });
  const link = h("a", { class: "cmp-open", href: `/a/${id}` }, "Åpne hele adresseprofilen →");
  link.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(`/a/${id}`);
  });
  const title = h("h1", { class: "cmp-title" }, h("a", { href: `/a/${id}` }, a.text));
  if (a.text.length > 20) title.classList.add("is-long");
  title.querySelector("a")!.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(`/a/${id}`);
  });
  body.replaceChildren(
    title,
    h("p", { class: "cmp-sub" }, `${a.postcode} ${a.place} · ${a.municipality} kommune`),
    overall(p.rating),
    warnings(p),
    perspectives(p) ?? "",
  );
  const legend = h("p", { class: "cmp-legend" });
  mapCell.replaceChildren(mapEl, legend, link);
  smallMap(mapEl, legend, a.lng, a.lat);
}

function overall(r: Rating) {
  const ok = r.status === "ok" && r.score != null;
  const capped = ok && !!r.cappedBy?.length;
  return h(
    "div",
    { class: "cmp-overall" },
    h("span", { class: "cmp-score" }, ok ? r.score : null, ok ? h("span", { class: "cmp-of" }, "/100") : null),
    h(
      "div",
      { class: "cmp-overall-text" },
      h("div", { class: "cmp-word" }, !ok ? "Kan ikke vurderes" : capped ? r.cappedBy![0].text : scoreWord(r.score!)),
      !ok && r.reason ? h("p", { class: "cmp-reason" }, r.reason) : null,
      capped ? h("p", { class: "cmp-cap" }, `Begrenset til ${r.score}`) : null,
    ),
  );
}

function scoreWord(score: number) {
  if (score >= 80) return "Svært god";
  if (score >= 60) return "God";
  if (score >= 40) return "Middels";
  return "Svak";
}

const SEVERITY_WORD: Record<Severity, string> = { high: "Alvorlig", medium: "Viktig", low: "Merk" };

function warnings(p: Profile) {
  if (!p.warnings.length) return h("p", { class: "cmp-none" }, "Ingen advarsler");
  return h(
    "ul",
    { class: "cmp-warnings" },
    ...p.warnings.slice(0, 3).map((w) =>
      h("li", { class: `cmp-warning cmp-warning--${w.severity}` }, h("span", { class: "cmp-sev" }, SEVERITY_WORD[w.severity]), h("span", {}, w.text)),
    ),
  );
}

function perspectives(p: Profile) {
  if (!p.perspectives?.length) return null;
  return h(
    "div",
    { class: "cmp-persp-wrap" },
    h("span", { class: "cmp-persp-label" }, "Egnethet for:"),
  h(
    "ul",
    { class: "cmp-persp", "aria-label": "Egnethet for" },
    ...p.perspectives.map((x) => {
      const ok = x.rating.status === "ok" && x.rating.score != null;
      const unsure = ok && x.rating.coverage.present < 3;
      return h(
        "li",
        { class: unsure ? "is-unsure" : "" },
        h("span", { class: "cmp-persp-name" }, x.name),
        h("span", { class: `cmp-persp-score${ok ? "" : " is-none"}` }, ok ? x.rating.score : "Kan ikke vurderes"),
        unsure ? h("span", { class: "cmp-unsure" }, "usikker") : null,
      );
    }),
  ));
}

async function addZones(map: MapLibre, legend: HTMLElement, lng: number, lat: number) {
  const bbox = [lng - 0.008, lat - 0.004, lng + 0.008, lat + 0.004].join(",");
  const get = async (path: string) => {
    try {
      const res = await fetch(`/api/${path}?bbox=${bbox}&limit=1000`);
      return res.ok ? ((await res.json()) as FC) : null;
    } catch {
      return null;
    }
  };
  const [clay, flood] = await Promise.all([get("nve_kvikkleire"), get("flomsoner")]);
  const bad = cssVar("--bad"), warn = cssVar("--warn"), teal = cssVar("--teal");
  const items: [string, string][] = [];
  const add = (id: string, data: FC, color: unknown) => {
    map.addSource(id, { type: "geojson", data });
    map.addLayer({ id: `${id}-fill`, type: "fill", source: id, paint: { "fill-color": color as any, "fill-opacity": 0.3 } });
    map.addLayer({ id: `${id}-line`, type: "line", source: id, paint: { "line-color": color as any, "line-width": 1 } });
  };
  const run = () => {
    if (clay?.features.length) {
      const fg = ["downcase", ["to-string", ["coalesce", ["get", "faregrad"], ""]]];
      add("cmp-clay", clay, ["match", fg, "høy", bad, "middels", warn, warn]);
      items.push([bad, "Kvikkleire"]);
    }
    if (flood?.features.length) {
      add("cmp-flood", flood, teal);
      items.push([teal, "Flom"]);
    }
    if (items.length) {
      legend.replaceChildren(...items.map(([c, l]) => h("span", { class: "cmp-legend-item" }, h("i", { style: `background:${c}` }), l)));
      fit();
    } else {
      legend.classList.add("is-empty");
      legend.textContent = "Ingen kartlagte kvikkleire- eller flomsoner her";
    }
  };
  // Fit the pin plus the zones right around it (see below).
  const fit = () => {
    const dx = 0.0054, dy = 0.0027;
    const b = new LngLatBounds([lng, lat], [lng, lat]);
    let any = false;
    const walk = (c: any, f: (p: [number, number]) => void) => (typeof c[0] === "number" ? f(c as [number, number]) : c.forEach((x: any) => walk(x, f)));
    for (const fc of [clay, flood]) {
      for (const feat of (fc?.features ?? []) as any[]) {
        const pts: [number, number][] = [];
        walk(feat.geometry?.coordinates ?? [], (p) => pts.push(p));
        // Only zones within ~150 m of the pin decide the view, clamped to ~300 m, so a long river flood zone can't zoom us out.
        if (!pts.some(([x, y]) => Math.abs(x - lng) <= dx / 2 && Math.abs(y - lat) <= dy / 2)) continue;
        any = true;
        for (const [x, y] of pts) b.extend([Math.min(lng + dx, Math.max(lng - dx, x)), Math.min(lat + dy, Math.max(lat - dy, y))]);
      }
    }
    if (!any) return;
    // Symmetric around the pin, so it always sits in the middle of the view.
    const hx = Math.max(Math.abs(b.getWest() - lng), Math.abs(b.getEast() - lng), dx * 0.4);
    const hy = Math.max(Math.abs(b.getSouth() - lat), Math.abs(b.getNorth() - lat), dy * 0.4);
    map.fitBounds([[lng - hx, lat - hy], [lng + hx, lat + hy]], { padding: 24, maxZoom: 16, duration: 0 });
  };
  if (map.loaded()) run();
  else map.once("load", run);
}

function smallMap(container: HTMLElement, legend: HTMLElement, lng: number, lat: number) {
  const map = new MapLibre({
    container,
    center: [lng, lat],
    zoom: 15,
    interactive: false, // zoom buttons only
    attributionControl: { compact: true },
    style: basemapStyle(),
  });
  map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
  const el = document.createElement("div");
  el.className = "map-pin cmp-pin";
  el.innerHTML = `<svg viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.5 16 43 16 43s15-16.5 15-27.2C31 7.6 24.3 1 16 1z" fill="var(--orange)" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>`;
  new Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
  maps.push(map);
  void addZones(map, legend, lng, lat);
}

// ---------- table ----------

function table(A: Profile, B: Profile) {
  const byId = (p: Profile) => new Map(p.categories.map((c) => [c.id, c]));
  const ma = byId(A), mb = byId(B);
  const order: string[] = [];
  for (const c of [...A.categories, ...B.categories]) if (!order.includes(c.id)) order.push(c.id);

  const score = (c?: { rating: Rating }) => (c && c.rating.status === "ok" && c.rating.score != null ? c.rating.score : undefined);
  const NO_SCORE = "Ingen skår for denne kategorien ennå";
  const cell = (s: number | undefined, win: boolean, tie: boolean, r?: Rating) =>
    h(
      "td",
      { class: `cmp-num${win ? " is-better" : ""}${s == null ? " is-none" : ""}`, title: s == null ? r?.reason || NO_SCORE : undefined },
      s == null ? "Kan ikke vurderes" : s,
      s == null ? h("small", { class: "cmp-cell-reason" }, r?.reason || NO_SCORE) : null,
      win ? h("span", { class: "cmp-better" }, " ▲ Best") : null,
      tie && s != null ? h("span", { class: "cmp-tie" }, " Lik") : null,
    );

  const rows = order.map((id) => {
    const ca = ma.get(id), cb = mb.get(id);
    const sa = score(ca), sb = score(cb);
    const cmp = sa != null && sb != null && sa !== sb;
    return h(
      "tr",
      {},
      h("th", { scope: "row" }, (ca ?? cb)!.name),
      cell(sa, cmp && sa! > sb!, sa != null && sa === sb, ca?.rating),
      cell(sb, cmp && sb! > sa!, false, cb?.rating),
    );
  });

  const oa = A.rating.status === "ok" ? A.rating.score : undefined;
  const ob = B.rating.status === "ok" ? B.rating.score : undefined;
  const total = oa != null && ob != null && oa !== ob;

  return h(
    "table",
    { class: "cmp-table" },
    h("caption", {}, "Kategorier side om side"),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Kategori"), h("th", { scope: "col", class: "cmp-num" }, `A · ${A.address.text}`), h("th", { scope: "col", class: "cmp-num" }, `B · ${B.address.text}`))),
    h("tbody", {}, ...rows),
    h("tfoot", {}, h("tr", {}, h("th", { scope: "row" }, "Samlet"), cell(oa, total && oa! > ob!, oa != null && oa === ob, A.rating), cell(ob, total && ob! > oa!, false, B.rating))),
  );
}

function notice() {
  return h("p", { class: "cmp-none" }, "Tabellen vises når begge adressene er lastet.");
}

// ---------- states ----------

function skeleton() {
  return h("div", { class: "skeleton" }, h("div", { class: "sk cmp-sk-title" }), h("div", { class: "sk cmp-sk-score" }), h("div", { class: "sk cmp-sk-line" }), h("div", { class: "sk cmp-sk-map" }));
}

function errorState(status: number, retryFn: () => void) {
  const [title, text] =
    status === 400 || status === 404
      ? ["Fant ikke adressen", "Adressen finnes ikke, eller lenken er feil. Søk etter en annen adresse over."]
      : status === 0 || status === 502
        ? ["Får ikke kontakt med serveren", "Sjekk at API-et kjører (npm run dev), og prøv igjen."]
        : ["Noe gikk galt", "Prøv igjen om litt."];
  const retry = h("button", { class: "btn", type: "button" }, "Prøv igjen");
  retry.addEventListener("click", retryFn);
  return h("div", { class: "state" }, h("h1", {}, title), h("p", {}, text), status !== 404 && status !== 400 ? retry : null);
}
