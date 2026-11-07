import { Popup, type ExpressionSpecification, type GeoJSONSource, type Map, type MapGeoJSONFeature } from "maplibre-gl";
import { cssVar, h } from "../app/dom";
import "./hazards.css";

// NVE hazard zones on the address map: quick clay (GET /api/nve_kvikkleire) and flood zones (GET /api/flomsoner),
// plus the "Kartlag" panel to switch them on and off. Both tables are large, so we fetch only the current view,
// refetch on moveend (debounced), and only from MIN_ZOOM and closer.

const MIN_ZOOM = 11;
const LIMIT = 1000;
const FILL_OPACITY = 0.3;

type LayerId = "kvikkleire" | "flom";
type Cls = { label: string; color: string };
type HazardLayer = {
  id: LayerId;
  label: string;
  endpoint: string;
  classes: Cls[];
  fillColor: ExpressionSpecification;
  lineColor?: ExpressionSpecification;
  filter?: ExpressionSpecification;
  sortKey?: ExpressionSpecification;
};

/** Mix two hex colours: t = 0 gives a, t = 1 gives b. */
function mix(a: string, b: string, t: number): string {
  const rgb = (hex: string) => {
    const m = hex.replace("#", "");
    const full = m.length === 3 ? [...m].map((c) => c + c).join("") : m;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const [ca, cb] = [rgb(a), rgb(b)];
  return "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function hazardLayers(): HazardLayer[] {
  const bad = cssVar("--bad");
  const warn = cssVar("--warn");
  const surface = cssVar("--surface");
  const teal = cssVar("--teal");
  const water = cssVar("--map-water");

  const clay = { hoy: bad, middels: warn, lav: mix(warn, surface, 0.45) };
  // Darker for the more frequent floods: 10-year is teal, 200-year is the map water colour.
  const flood: [number, string][] = [
    [10, teal],
    [20, mix(teal, water, 0.25)],
    [50, mix(teal, water, 0.5)],
    [100, mix(teal, water, 0.7)],
    [200, mix(teal, water, 0.85)],
  ];
  const floodStep = (colors: [number, string][]): ExpressionSpecification => [
    "step",
    interval,
    colors[0][1],
    ...colors.slice(1).flatMap(([years, color]) => [years, color] as [number, string]),
  ];
  const faregrad: ExpressionSpecification = ["downcase", ["to-string", ["get", "faregrad"]]];
  const interval: ExpressionSpecification = ["to-number", ["get", "gjentaksintervall"], 0];

  return [
    {
      id: "kvikkleire",
      label: "Kvikkleire",
      endpoint: "/api/nve_kvikkleire",
      classes: [
        { label: "Høy faregrad", color: clay.hoy },
        { label: "Middels faregrad", color: clay.middels },
        { label: "Lav faregrad", color: clay.lav },
      ],
      fillColor: ["match", faregrad, "høy", clay.hoy, "middels", clay.middels, clay.lav],
      filter: ["match", faregrad, ["høy", "middels", "lav"], true, false],
      // Highest hazard on top.
      sortKey: ["match", faregrad, "høy", 3, "middels", 2, 1],
    },
    {
      id: "flom",
      label: "Flom",
      endpoint: "/api/flomsoner",
      classes: flood.map(([years, color]) => ({ label: `${years}-årsflom`, color })),
      fillColor: floodStep(flood),
      // The pale zones need a darker outline to read on the cream land and the blue water.
      lineColor: floodStep(flood.map(([years, color]) => [years, mix(color, teal, 0.5)])),
      // Larger return periods first, so the 10-year zone ends up on top.
      sortKey: ["-", 0, interval],
    },
  ];
}

const emptyData = { type: "FeatureCollection" as const, features: [] };

export default function (map: Map) {
  const layers = hazardLayers();
  const visible: Record<LayerId, boolean> = { kvikkleire: true, flom: true };
  const aborts: Partial<Record<LayerId, AbortController>> = {};

  // Flood below quick clay: quick clay is the sharper warning.
  for (const L of [...layers].reverse()) {
    map.addSource(`hz-${L.id}`, { type: "geojson", data: emptyData });
    map.addLayer({
      id: `hz-${L.id}-fill`,
      type: "fill",
      source: `hz-${L.id}`,
      ...(L.filter ? { filter: L.filter } : {}),
      layout: L.sortKey ? { "fill-sort-key": L.sortKey } : {},
      paint: { "fill-color": L.fillColor, "fill-opacity": FILL_OPACITY },
    });
    map.addLayer({
      id: `hz-${L.id}-line`,
      type: "line",
      source: `hz-${L.id}`,
      ...(L.filter ? { filter: L.filter } : {}),
      layout: L.sortKey ? { "line-sort-key": L.sortKey } : {},
      paint: { "line-color": L.lineColor ?? L.fillColor, "line-width": 1, "line-opacity": 0.9 },
    });
  }
  const fillIds = layers.map((L) => `hz-${L.id}-fill`);

  // ---------- Data ----------
  async function load(L: HazardLayer) {
    aborts[L.id]?.abort();
    const source = map.getSource<GeoJSONSource>(`hz-${L.id}`);
    if (!source) return;
    if (!visible[L.id] || map.getZoom() < MIN_ZOOM) {
      source.setData(emptyData);
      return;
    }
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(",");
    const ctrl = new AbortController();
    aborts[L.id] = ctrl;
    try {
      const res = await fetch(`${L.endpoint}?bbox=${bbox}&limit=${LIMIT}`, { signal: ctrl.signal });
      if (!res.ok) {
        console.warn(`${L.id}: HTTP ${res.status}`, await res.text());
        return;
      }
      const data = await res.json();
      if (!ctrl.signal.aborted) source.setData(data);
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.warn(`${L.id}: fetch failed`, err);
    }
  }

  const loadAll = () => {
    for (const L of layers) void load(L);
    updateZoomNote();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onMoveEnd = () => {
    clearTimeout(timer);
    timer = setTimeout(loadAll, 250);
  };
  map.on("moveend", onMoveEnd);

  // ---------- Popup ----------
  const popup = new Popup({ className: "hz-popup", maxWidth: "18rem" });

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: fillIds.filter((id) => map.getLayer(id)) });
    if (!hits.length) return;
    // One line per layer: the most serious zone of each (top of the sort order).
    const clay = hits.find((f) => f.layer.id === "hz-kvikkleire-fill");
    const floods = hits.filter((f) => f.layer.id === "hz-flom-fill");
    const flood = floods.sort((a, b) => Number(a.properties.gjentaksintervall) - Number(b.properties.gjentaksintervall))[0];
    const body = h("div", { class: "hz-popup__body" }, clay && clayFacts(clay), flood && floodFacts(flood));
    popup.setLngLat(e.lngLat).setDOMContent(body).addTo(map);
  });
  for (const id of fillIds) {
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }

  // ---------- Panel ----------
  const container = map.getContainer();
  container.querySelector(".hz-panel")?.remove();
  const zoomNote = h("p", { class: "hz-panel__note", hidden: true }, "Zoom inn for å se sonene.");
  const panel = h(
    "section",
    { class: "hz-panel", "aria-labelledby": "hz-panel-title" },
    h("h2", { class: "hz-panel__title", id: "hz-panel-title" }, "Kartlag"),
    h(
      "fieldset",
      { class: "hz-panel__group" },
      h("legend", { class: "hz-panel__group-title" }, "Naturfare"),
      ...layers.map((L) => layerRow(L)),
    ),
    zoomNote,
  );
  container.append(panel);

  function layerRow(L: HazardLayer): HTMLElement {
    const input = h("input", { type: "checkbox", id: `hz-toggle-${L.id}`, checked: visible[L.id] });
    input.addEventListener("change", () => {
      visible[L.id] = input.checked;
      const v = input.checked ? "visible" : "none";
      map.setLayoutProperty(`hz-${L.id}-fill`, "visibility", v);
      map.setLayoutProperty(`hz-${L.id}-line`, "visibility", v);
      if (!input.checked) popup.remove();
      void load(L);
    });
    const legend = h(
      "ul",
      { class: "hz-panel__legend", "aria-label": `Klasser for ${L.label.toLowerCase()}` },
      ...L.classes.map((c) => h("li", {}, swatch(c.color), c.label)),
    );
    return h(
      "div",
      { class: "hz-panel__layer" },
      h("label", { class: "hz-panel__row", for: `hz-toggle-${L.id}` }, input, swatch(L.classes[0].color), L.label),
      legend,
    );
  }

  function updateZoomNote() {
    zoomNote.hidden = map.getZoom() >= MIN_ZOOM;
  }

  map.once("remove", () => {
    clearTimeout(timer);
    for (const c of Object.values(aborts)) c?.abort();
    panel.remove();
  });

  loadAll();
}

function swatch(color: string): HTMLElement {
  const el = h("span", { class: "hz-swatch", "aria-hidden": "true" });
  el.style.setProperty("--hz-color", color);
  return el;
}

function clayFacts(f: MapGeoJSONFeature): HTMLElement {
  const p = f.properties;
  const grad = String(p.faregrad ?? "").toLowerCase();
  const link =
    typeof p.reportUrl === "string" && /^https?:\/\//.test(p.reportUrl)
      ? h("a", { href: p.reportUrl, target: "_blank", rel: "noopener" }, "Les rapporten hos NVE")
      : null;
  return h(
    "div",
    { class: "hz-popup__item" },
    h("strong", {}, `Kvikkleire, faregrad ${grad}`),
    p.name ? h("span", {}, String(p.name)) : null,
    p.konsekvens ? h("span", {}, `Konsekvens: ${String(p.konsekvens).toLowerCase()}`) : null,
    p.risikoklasse !== undefined && p.risikoklasse !== null ? h("span", {}, `Risikoklasse ${p.risikoklasse} av 5`) : null,
    link,
  );
}

function floodFacts(f: MapGeoJSONFeature): HTMLElement {
  // The name is only "20-årsflom (fs002_37)": the interval plus an internal id, so we leave it out.
  return h("div", { class: "hz-popup__item" }, h("strong", {}, `Flomsone, ${f.properties.gjentaksintervall}-årsflom`));
}
