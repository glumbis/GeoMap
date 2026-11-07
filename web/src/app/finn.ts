// "Finn område" page /finn: reverse search. The user describes a place (or sets filters) and the map highlights the
// 500 m squares that fit. Data: GET /api/finn (GeoJSON squares) and GET /api/finn/tolk (free text -> criteria).
// Criteria live in the URL query string so a search can be shared. Layers on the shared map are removed in leaveFinn().
import { LngLatBounds, Popup, type GeoJSONSource, type LngLatLike } from "maplibre-gl";
import { cssVar, h, titleCase } from "./dom";
import { topbarLogo, setLogoLoading } from "./logo";
import { getMap, showMapOverview } from "./map";
import { clickHook } from "../features/hazards";
import "./finn.css";

// ---------- Criteria ----------

type Criteria = Record<string, string>; // URL-style: every value a string, unset keys absent

const SCORES = [
  { key: "minScore", label: "Samlet score" },
  { key: "minLiving", label: "Bo her" },
  { key: "minBuilding", label: "Bygge her" },
  { key: "minFamily", label: "Familie" },
  { key: "minCommuter", label: "Pendler" },
] as const;
const TOGGLES = [
  { key: "noHazard", label: "Ingen kjent naturfare" },
  { key: "quiet", label: "Rolig (lite veistøy)" },
] as const;
const DISTANCES = [
  { key: "maxSchoolM", prop: "schoolM", label: "Skole" },
  { key: "maxKindergartenM", prop: "kindergartenM", label: "Barnehage" },
  { key: "maxGroceryM", prop: "groceryM", label: "Dagligvare" },
  { key: "maxTransitStopM", prop: "transitStopM", label: "Holdeplass" },
  { key: "maxTrailsM", prop: "trailsM", label: "Tursti" },
  { key: "maxDoctorM", prop: "doctorM", label: "Lege" },
] as const;
const DIST_OPTIONS = [500, 1000, 2000];
const PERSP_PROPS: Record<string, string> = { minLiving: "living", minBuilding: "building", minFamily: "family", minCommuter: "commuter" };
const KNOWN = [
  ...SCORES.map((s) => s.key),
  ...TOGGLES.map((t) => t.key),
  ...DISTANCES.map((d) => d.key),
  "minTransitDepartures",
  "kommune",
] as string[];

// Oslo + Akershus, roughly (Asker to Aurskog-Høland, Vestby to Hurdal).
const REGION: [[number, number], [number, number]] = [[10.15, 59.45], [11.95, 60.45]];
const LIMIT = 5000;
const nb = new Intl.NumberFormat("nb-NO");

function readUrl(): Criteria {
  const c: Criteria = {};
  const p = new URLSearchParams(location.search);
  for (const k of KNOWN) {
    const v = p.get(k)?.trim();
    if (v) c[k] = v;
  }
  return c;
}

function writeUrl(c: Criteria) {
  const qs = new URLSearchParams(c).toString();
  history.replaceState(history.state, "", `/finn${qs ? `?${qs}` : ""}`);
}

/** Criteria from /api/finn/tolk (numbers, booleans, nulls) -> our string form. Unknown keys and empty values are dropped. */
function fromTolk(raw: Record<string, unknown> | undefined): Criteria {
  const c: Criteria = {};
  for (const k of KNOWN) {
    const v = raw?.[k];
    if (v === null || v === undefined || v === false || v === "" || v === 0) continue;
    if (k === "noHazard" || k === "quiet") c[k] = "1";
    else if (k === "kommune") c[k] = String(v);
    else if (Number.isFinite(Number(v))) c[k] = String(Math.round(Number(v)));
  }
  return c;
}

const meters = (m: number) => (m < 1000 ? `${nb.format(Math.round(m / 10) * 10)} m` : `${nb.format(Math.round(m / 100) / 10)} km`);
const distLabel = (m: number) => (m % 1000 === 0 ? `${m / 1000} km` : `${nb.format(m)} m`);

/** Human words for one criterion, for the "loosen this one" hint. */
function criterionLabel(k: string, v: string): string {
  const s = SCORES.find((x) => x.key === k);
  if (s) return `${s.label} minst ${v}`;
  const t = TOGGLES.find((x) => x.key === k);
  if (t) return t.label;
  const d = DISTANCES.find((x) => x.key === k);
  if (d) return `${d.label} innen ${distLabel(Number(v))}`;
  if (k === "minTransitDepartures") return `Minst ${v} avganger`;
  if (k === "kommune") return `Kommune: ${v}`;
  return k;
}

// ---------- Square properties (any may be null = unknown) ----------

type Props = {
  cid?: string | number;
  score?: number | null;
  living?: number | null;
  building?: number | null;
  family?: number | null;
  commuter?: number | null;
  hazard?: boolean | string | null;
  quiet?: boolean | null;
  noiseDb?: number | null;
  transitDepartures?: number | null;
  kommune?: string | null;
  capText?: string | null;
  [k: string]: unknown;
};
type Square = { type: "Feature"; geometry: { type: string; coordinates: any }; properties: Props };
type Result = { type: "FeatureCollection"; features: Square[]; matched?: number; total?: number };

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const placeName = (p: Props) => (p.kommune ? titleCase(String(p.kommune)) : "Ukjent kommune");

/** The 2–3 facts that matched the active criteria, e.g. "Skole 420 m · Rolig". */
function matchedFacts(p: Props, c: Criteria): string[] {
  const out: string[] = [];
  for (const [k, prop] of Object.entries(PERSP_PROPS)) {
    const v = num(p[prop]);
    if (c[k] && v !== undefined) out.push(`${SCORES.find((s) => s.key === k)!.label} ${Math.round(v)}`);
  }
  for (const d of DISTANCES) {
    const v = num(p[d.prop]);
    if (c[d.key] && v !== undefined) out.push(`${d.label} ${meters(v)}`);
  }
  if (c.quiet && p.quiet) out.push("Rolig");
  if (c.noHazard && p.hazard === false) out.push("Ingen kjent naturfare");
  return out.slice(0, 3);
}

/** Centre and bounds of a square (any polygon). */
function boundsOf(geom: Square["geometry"] | undefined, b = new LngLatBounds()): LngLatBounds {
  const walk = (x: any): void => {
    if (typeof x?.[0] === "number") b.extend([x[0], x[1]]);
    else if (Array.isArray(x)) x.forEach(walk);
  };
  walk(geom?.coordinates);
  return b;
}

// ---------- Page state (one /finn page at a time) ----------

let page = 0; // bumped when the page is left or re-rendered: late responses for an old page do nothing
let cleanup: (() => void) | undefined;

/** Called by the router before any page renders: removes our layers, popup, click hook and timers from the shared map. */
export function leaveFinn() {
  page++;
  cleanup?.();
  cleanup = undefined;
}

export function renderFinn(app: HTMLElement) {
  leaveFinn();
  const me = page;
  const alive = () => me === page;
  app.className = "page-address page-finn";
  document.title = "Finn område · Omnium";

  let criteria = readUrl();
  let last: Result | undefined;
  let ctrl: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tolkCtrl: AbortController | undefined;

  const logo = topbarLogo();

  // ---- Free-text ask ----
  const ask = h("textarea", {
    id: "finn-ask",
    class: "finn-ask__input",
    rows: 2,
    placeholder: "Rolig sted for barnefamilie med skole innen 1 km",
  });
  const askBtn = h("button", { class: "finn-btn", type: "submit" }, "Finn");
  const explain = h("p", { class: "finn-explain", "aria-live": "polite", hidden: true });
  const askForm = h(
    "form",
    { class: "finn-ask" },
    h("label", { class: "finn-ask__label", for: "finn-ask" }, "Beskriv hva du ser etter"),
    h("div", { class: "finn-ask__row" }, ask, askBtn),
    explain,
  );
  ask.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askForm.requestSubmit();
    }
  });
  askForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void interpret(ask.value.trim());
  });

  // ---- Filters ----
  const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  const outputs: Record<string, HTMLElement> = {};

  const scoreRows = SCORES.map((s) => {
    const id = `finn-${s.key}`;
    const range = h("input", { id, type: "range", min: 0, max: 100, step: 5, value: 0, class: "finn-range" });
    const out = h("output", { class: "finn-range__value", for: id });
    inputs[s.key] = range;
    outputs[s.key] = out;
    range.addEventListener("input", () => {
      set(s.key, range.value === "0" ? undefined : range.value);
    });
    return h("div", { class: `finn-score${s.key === "minScore" ? " is-main" : ""}` }, h("label", { for: id }, s.label), range, out);
  });

  const toggleRows = TOGGLES.map((t) => {
    const id = `finn-${t.key}`;
    const box = h("input", { id, type: "checkbox", class: "finn-check" });
    inputs[t.key] = box;
    box.addEventListener("change", () => set(t.key, box.checked ? "1" : undefined));
    return h("label", { class: "finn-toggle", for: id }, box, h("span", {}, t.label));
  });

  const distRows = DISTANCES.map((d) => {
    const id = `finn-${d.key}`;
    const sel = h(
      "select",
      { id, class: "finn-select" },
      h("option", { value: "" }, "Uansett"),
      ...DIST_OPTIONS.map((m) => h("option", { value: m }, `${distLabel(m)}`)),
    );
    inputs[d.key] = sel;
    sel.addEventListener("change", () => set(d.key, sel.value || undefined));
    return h("div", { class: "finn-dist" }, h("label", { for: id }, d.label), sel);
  });

  const kommune = h("input", { id: "finn-kommune", type: "text", class: "finn-text", placeholder: "Alle", autocomplete: "off" });
  inputs.kommune = kommune;
  kommune.addEventListener("input", () => set("kommune", kommune.value.trim() || undefined));

  // Criteria without their own control (from the text search): shown as removable chips.
  const extras = h("div", { class: "finn-extras" });

  const reset = h("button", { class: "finn-link", type: "button" }, "Nullstill");
  reset.addEventListener("click", () => {
    criteria = {};
    explain.hidden = true;
    syncControls();
    changed(0);
  });

  const filters = h(
    "section",
    { class: "finn-filters", "aria-label": "Kriterier" },
    h("div", { class: "finn-section__head" }, h("h2", {}, "Kriterier"), reset),
    h("fieldset", { class: "finn-group" }, h("legend", {}, "Score minst"), ...scoreRows),
    h("fieldset", { class: "finn-group finn-group--toggles" }, h("legend", {}, "Område"), ...toggleRows),
    h("fieldset", { class: "finn-group" }, h("legend", {}, "Avstand, høyst"), h("div", { class: "finn-dists" }, ...distRows)),
    h("div", { class: "finn-group finn-kommune" }, h("label", { for: "finn-kommune" }, "Kommune"), kommune),
    extras,
  );

  // ---- Results ----
  const count = h("p", { class: "finn-count", "aria-live": "polite" });
  const status = h("p", { class: "finn-status", "aria-live": "polite" });
  const list = h("ol", { class: "finn-list" });
  // The count stays pinned at the top of the panel while the user scrolls through the filters.
  const results = h("section", { class: "finn-results", "aria-label": "Treff" }, count, status);
  const best = h("section", { class: "finn-best", "aria-label": "Beste treff" }, h("h2", {}, "Beste treff"), list);

  const notes = h(
    "div",
    { class: "finn-notes" },
    h("p", {}, "Områder uten data for et kriterium regnes ikke som treff."),
    h("p", {}, "Hvert område er 500 × 500 m; score er beregnet for midten. Søk opp en adresse for nøyaktig vurdering."),
  );

  const panel = h(
    "section",
    { class: "panel finn-panel" },
    h("p", { class: "finn-lede" }, "Fortell hva som er viktig for deg, så viser kartet hvilke områder i Oslo og Akershus som passer."),
    askForm,
    results,
    filters,
    best,
    notes,
  );
  const mapEl = h("div", { class: "map finn-map" });
  app.replaceChildren(
    h("header", { class: "topbar" }, logo, h("h1", { class: "finn-heading" }, "Finn område")),
    h("div", { class: "address-layout finn-layout" }, panel, mapEl),
  );

  // ---- Map ----
  showMapOverview(mapEl);
  const map = getMap()!;
  map.stop();
  map.fitBounds(REGION, { padding: 24, duration: 0 });

  const popup = new Popup({ className: "hz-popup finn-popup", maxWidth: "19rem", offset: 4 });
  let hookPrev: typeof clickHook.current;
  let selected: string | number | undefined;

  const SRC = "finn";
  const LAYERS = ["finn-fill", "finn-line", "finn-sel"];

  function setupLayers() {
    if (!alive() || map.getSource(SRC)) return;
    const teal = cssVar("--teal");
    const orange = cssVar("--orange");
    map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "cid" });
    // Higher score = stronger fill. Zoomed in to pick addresses, the squares fade so the streets show.
    const byScore = ["interpolate", ["linear"], ["coalesce", ["get", "score"], 50], 40, 0.35, 90, 0.68];
    map.addLayer({
      id: "finn-fill",
      type: "fill",
      source: SRC,
      paint: { "fill-color": teal, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, byScore as any, 16, 0.14] },
    });
    map.addLayer({ id: "finn-line", type: "line", source: SRC, paint: { "line-color": teal, "line-width": 0.6, "line-opacity": 0.8 } });
    map.addLayer({
      id: "finn-sel",
      type: "line",
      source: SRC,
      filter: ["==", ["get", "cid"], "__none__"],
      paint: { "line-color": orange, "line-width": 3 },
    });
    map.on("mouseenter", "finn-fill", onEnter);
    map.on("mouseleave", "finn-fill", onLeave);
    if (last) draw(last, true);
  }
  const onEnter = () => map.getZoom() < 15 && (map.getCanvas().style.cursor = "pointer");
  const onLeave = () => (map.getCanvas().style.cursor = "");

  // Clicks: hazards.ts hands every map click to clickHook (pick.ts: nearest address). On a square, below zoom 15,
  // we show the square's popup instead; zoomed in, the click goes on to pick.ts so the user can choose an address.
  const hookMine: NonNullable<typeof clickHook.current> = (e, blocks) => {
    const hit = map.getLayer("finn-fill") && map.getZoom() < 15 ? map.queryRenderedFeatures(e.point, { layers: ["finn-fill"] })[0] : undefined;
    if (hit) openPopup(hit.properties as Props, e.lngLat);
    else hookPrev?.(e, blocks);
  };
  /** Wrap whatever clickHook pick.ts set. It sets it in a microtask after "load", so check again whenever the map is idle. */
  function ensureHook() {
    if (!alive() || clickHook.current === hookMine) return;
    hookPrev = clickHook.current;
    clickHook.current = hookMine;
  }

  const onReady = () => {
    setupLayers();
    setTimeout(ensureHook, 0);
  };
  if (map.isStyleLoaded()) onReady();
  else map.once("load", onReady);
  map.on("idle", ensureHook);

  cleanup = () => {
    clearTimeout(timer);
    ctrl?.abort();
    tolkCtrl?.abort();
    popup.remove();
    map.off("load", onReady);
    map.off("idle", ensureHook);
    map.off("mouseenter", "finn-fill", onEnter);
    map.off("mouseleave", "finn-fill", onLeave);
    if (clickHook.current === hookMine) clickHook.current = hookPrev;
    try {
      for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC)) map.removeSource(SRC);
    } catch {
      // the map may already be gone (start page destroys it)
    }
    map.getCanvas().style.cursor = "";
    setLogoLoading(logo, false);
  };

  function select(cid: string | number | undefined) {
    selected = cid;
    if (map.getLayer("finn-sel")) map.setFilter("finn-sel", ["==", ["get", "cid"], cid ?? "__none__"]);
    for (const li of list.querySelectorAll<HTMLElement>("[data-cid]")) li.classList.toggle("is-selected", li.dataset.cid === String(cid));
  }

  function openPopup(p: Props, at: LngLatLike) {
    const sq = last?.features.find((f) => String(f.properties.cid) === String(p.cid));
    const props = sq?.properties ?? p; // queryRenderedFeatures drops nulls; prefer the original
    select(props.cid);
    popup.setLngLat(at).setDOMContent(popupBody(props, sq)).addTo(map);
  }
  popup.on("close", () => select(undefined));

  function popupBody(p: Props, sq?: Square): HTMLElement {
    const score = num(p.score);
    const persp = [
      ["Bo her", p.living],
      ["Bygge her", p.building],
      ["Familie", p.family],
      ["Pendler", p.commuter],
    ] as const;
    const facts: [string, string][] = [];
    for (const d of DISTANCES) {
      const v = num(p[d.prop]);
      facts.push([d.label, v === undefined ? "Ukjent" : meters(v)]);
    }
    const db = num(p.noiseDb);
    facts.push([
      "Veistøy",
      p.quiet === true ? `Rolig${db !== undefined ? ` (${Math.round(db)} dB)` : ""}` : db !== undefined ? `${Math.round(db)} dB` : p.quiet === false ? "Ikke rolig" : "Ukjent",
    ]);
    facts.push([
      "Naturfare",
      p.hazard === false ? "Ingen kjent" : p.hazard === true ? "Kjent fare i området" : typeof p.hazard === "string" && p.hazard ? p.hazard : "Ukjent",
    ]);
    const dep = num(p.transitDepartures);
    if (dep !== undefined) facts.push(["Avganger, holdeplass", nb.format(Math.round(dep))]);

    const zoomBtn = h("button", { class: "finn-link finn-popup__zoom", type: "button" }, "Se adresser her →");
    zoomBtn.addEventListener("click", () => {
      popup.remove();
      const b = sq ? boundsOf(sq.geometry) : undefined;
      const center = b && !b.isEmpty() ? b.getCenter() : popup.getLngLat();
      map.flyTo({ center, zoom: 16, duration: 1200, essential: false });
      status.textContent = "Klikk i kartet for å se nærmeste adresse.";
    });

    return h(
      "div",
      { class: "hz-popup__body finn-popup__body" },
      h("p", { class: "finn-popup__place" }, placeName(p)),
      h(
        "p",
        { class: "finn-popup__score" },
        score === undefined ? h("span", { class: "is-none" }, "Ingen score") : h("strong", {}, Math.round(score)),
        score === undefined ? null : h("span", { class: "finn-popup__of" }, "/100"),
      ),
      p.capText ? h("p", { class: "finn-popup__cap" }, String(p.capText)) : null,
      h(
        "dl",
        { class: "finn-popup__persp" },
        ...persp.flatMap(([label, v]) => {
          const n = num(v);
          return [h("dt", {}, label), h("dd", { class: n === undefined ? "is-none" : "" }, n === undefined ? "–" : Math.round(n))];
        }),
      ),
      h("dl", { class: "finn-popup__facts" }, ...facts.flatMap(([k, v]) => [h("dt", {}, k), h("dd", { class: v === "Ukjent" ? "is-none" : "" }, v)])),
      h("p", { class: "finn-popup__note" }, "Score og avstander gjelder midten av ruten."),
      zoomBtn,
    );
  }

  // ---- Controls <-> criteria ----

  function syncControls() {
    for (const s of SCORES) {
      const v = criteria[s.key] ?? "0";
      inputs[s.key].value = v;
      outputs[s.key].textContent = criteria[s.key] ? criteria[s.key] : "Uansett";
      outputs[s.key].classList.toggle("is-off", !criteria[s.key]);
    }
    for (const t of TOGGLES) (inputs[t.key] as HTMLInputElement).checked = criteria[t.key] === "1";
    for (const d of DISTANCES) {
      const sel = inputs[d.key] as HTMLSelectElement;
      const v = criteria[d.key] ?? "";
      if (v && !Array.from(sel.options).some((o) => o.value === v)) sel.append(h("option", { value: v }, distLabel(Number(v))));
      sel.value = v;
    }
    if (document.activeElement !== kommune) kommune.value = criteria.kommune ?? "";
    // Extras: criteria with no control of their own.
    extras.replaceChildren();
    if (criteria.minTransitDepartures) {
      const x = h("button", { class: "finn-chip", type: "button", "aria-label": "Fjern kravet" }, criterionLabel("minTransitDepartures", criteria.minTransitDepartures), h("span", { "aria-hidden": "true" }, " ×"));
      x.addEventListener("click", () => set("minTransitDepartures", undefined));
      extras.append(x);
    }
  }

  function set(k: string, v: string | undefined) {
    if (v === undefined) delete criteria[k];
    else criteria[k] = v;
    if (k in outputs) {
      outputs[k].textContent = v ?? "Uansett";
      outputs[k].classList.toggle("is-off", !v);
    }
    if (k === "minTransitDepartures") syncControls();
    changed();
  }

  function changed(delay = 300) {
    writeUrl(criteria);
    clearTimeout(timer);
    timer = setTimeout(() => void search(), delay);
  }

  // ---- Search ----

  async function search() {
    ctrl?.abort();
    popup.remove();
    if (!Object.keys(criteria).length) {
      last = undefined;
      draw(undefined, false);
      count.replaceChildren();
      status.className = "finn-status is-hint";
      status.textContent = "Velg minst ett kriterium, eller beskriv stedet med egne ord.";
      list.replaceChildren();
      return;
    }
    const mine = new AbortController();
    ctrl = mine;
    status.className = "finn-status is-loading";
    status.textContent = "Søker …";
    results.classList.add("is-busy");
    best.classList.add("is-busy");
    setLogoLoading(logo, true);
    try {
      const qs = new URLSearchParams({ ...criteria, limit: String(LIMIT) });
      const res = await fetch(`/api/finn?${qs}`, { signal: mine.signal });
      const body = await res.json().catch(() => null);
      if (!alive() || ctrl !== mine) return;
      if (!res.ok) return showError(res.status, body?.message);
      last = body as Result;
      showResult(last);
      draw(last, true);
    } catch (err) {
      if ((err as Error).name === "AbortError" || !alive()) return;
      showError(0);
    } finally {
      if (alive()) {
        setLogoLoading(logo, false);
        if (ctrl === mine) {
          results.classList.remove("is-busy");
          best.classList.remove("is-busy");
        }
      }
    }
  }

  function showError(statusCode: number, message?: string) {
    last = undefined;
    draw(undefined, false);
    count.replaceChildren();
    list.replaceChildren();
    status.className = "finn-status is-error";
    status.textContent =
      statusCode === 503
        ? `Områdedataene er ikke bygget ennå. ${message ?? ""}`.trim()
        : statusCode === 400
          ? `Søket ble avvist: ${message ?? "ugyldige kriterier."}`
          : statusCode === 0 || statusCode === 502 || statusCode === 404
            ? "Får ikke kontakt med søket. Sjekk at API-et kjører, og prøv igjen."
            : `Noe gikk galt. ${message ?? "Prøv igjen om litt."}`;
  }

  function showResult(r: Result) {
    const shown = r.features.length;
    const matched = r.matched ?? shown;
    count.replaceChildren(
      h("strong", {}, nb.format(matched)),
      r.total ? ` av ${nb.format(r.total)} områder passer` : matched === 1 ? " område passer" : " områder passer",
    );
    list.replaceChildren();
    if (!matched) {
      status.className = "finn-status is-empty";
      status.textContent = "Ingen områder passer alle kriteriene. Prøv å løsne på ett av dem.";
      void strictest();
      return;
    }
    status.className = "finn-status";
    status.textContent = shown < matched ? `Kartet viser ${nb.format(shown)} av dem.` : "";
    const best = [...r.features].sort((a, b) => (num(b.properties.score) ?? -1) - (num(a.properties.score) ?? -1)).slice(0, 8);
    list.replaceChildren(
      ...best.map((f, i) => {
        const p = f.properties;
        const score = num(p.score);
        const facts = matchedFacts(p, criteria);
        const btn = h(
          "button",
          { class: "finn-hit", type: "button" },
          h("span", { class: "finn-hit__rank" }, i + 1),
          h("span", { class: "finn-hit__main" }, h("span", { class: "finn-hit__place" }, placeName(p)), facts.length ? h("span", { class: "finn-hit__facts" }, facts.join(" · ")) : null),
          h("span", { class: `finn-hit__score${score === undefined ? " is-none" : ""}` }, score === undefined ? "–" : Math.round(score)),
        );
        btn.addEventListener("click", () => {
          const b = boundsOf(f.geometry);
          if (b.isEmpty()) return;
          const c = b.getCenter();
          popup.remove();
          select(p.cid);
          // Open the popup when the map has arrived, so it can pick the side with room.
          map.once("moveend", () => alive() && selected === p.cid && openPopup(p, c));
          map.flyTo({ center: c, offset: [0, map.getContainer().clientHeight * 0.25], zoom: Math.max(13, Math.min(map.getZoom() + 1, 14)), duration: 1000, essential: false });
        });
        return h("li", { "data-cid": String(p.cid ?? "") }, btn);
      }),
    );
    if (selected !== undefined) select(selected);
  }

  /** On zero matches: which single criterion, if dropped, gives the most matches? Cheap count-only requests. */
  async function strictest() {
    const keys = Object.keys(criteria);
    if (keys.length < 2 || keys.length > 10) return;
    const snapshot = { ...criteria };
    const mine = ctrl;
    try {
      const counts = await Promise.all(
        keys.map(async (k) => {
          const rest = { ...snapshot };
          delete rest[k];
          const res = await fetch(`/api/finn?${new URLSearchParams({ ...rest, limit: "1" })}`, { signal: mine?.signal });
          const body = res.ok ? ((await res.json()) as Result) : null;
          return [k, body?.matched ?? 0] as const;
        }),
      );
      if (!alive() || ctrl !== mine) return;
      const [k, n] = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (!n) return;
      const fix = h("button", { class: "finn-link", type: "button" }, `Fjern «${criterionLabel(k, snapshot[k])}»`);
      fix.addEventListener("click", () => {
        delete criteria[k];
        syncControls();
        changed(0);
      });
      status.replaceChildren(
        "Ingen områder passer alle kriteriene. ",
        h("br"),
        `Strengest er «${criterionLabel(k, snapshot[k])}»: uten det passer ${nb.format(n)} områder. `,
        fix,
      );
    } catch {
      // the hint is optional
    }
  }

  /** Put the squares on the map; fit the view to them after a new search. */
  function draw(r: Result | undefined, fit: boolean) {
    const src = map.getSource(SRC) as GeoJSONSource | undefined;
    if (!src) return;
    src.setData((r ?? { type: "FeatureCollection", features: [] }) as any);
    select(undefined);
    if (fit && r?.features.length) {
      const b = new LngLatBounds();
      for (const f of r.features) boundsOf(f.geometry, b);
      if (!b.isEmpty()) map.fitBounds(b, { padding: 48, maxZoom: 13, duration: 900, essential: false });
    }
  }

  // ---- Free text -> criteria ----

  async function interpret(q: string) {
    if (!q) return ask.focus();
    tolkCtrl?.abort();
    const mine = new AbortController();
    tolkCtrl = mine;
    askBtn.disabled = true;
    explain.hidden = false;
    explain.className = "finn-explain is-loading";
    explain.textContent = "Tolker teksten …";
    setLogoLoading(logo, true);
    try {
      const res = await fetch(`/api/finn/tolk?${new URLSearchParams({ q })}`, { signal: mine.signal });
      const body = await res.json().catch(() => null);
      if (!alive() || tolkCtrl !== mine) return;
      if (!res.ok) {
        explain.className = "finn-explain is-note";
        explain.textContent =
          res.status === 503
            ? "Tekstsøket er ikke tilgjengelig akkurat nå. Filtrene under virker som vanlig."
            : "Klarte ikke å tolke teksten. Prøv å si det på en annen måte, eller bruk filtrene under.";
        return;
      }
      const next = fromTolk(body?.criteria);
      explain.className = "finn-explain";
      explain.replaceChildren(h("span", { class: "finn-explain__label" }, "Slik forsto vi det: "), String(body?.explanation ?? ""));
      if (!Object.keys(next).length) {
        explain.append(h("br"), "Vi fant ingen kriterier i teksten. Prøv å være mer konkret, eller bruk filtrene under.");
        return;
      }
      criteria = next;
      syncControls();
      changed(0);
    } catch (err) {
      if ((err as Error).name === "AbortError" || !alive()) return;
      explain.className = "finn-explain is-note";
      explain.textContent = "Får ikke kontakt med tekstsøket. Filtrene under virker som vanlig.";
    } finally {
      if (alive()) {
        askBtn.disabled = false;
        setLogoLoading(logo, false);
      }
    }
  }

  syncControls();
  changed(0);
}
