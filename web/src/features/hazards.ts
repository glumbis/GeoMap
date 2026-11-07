import { Popup, type ExpressionSpecification, type GeoJSONSource, type Map, type MapGeoJSONFeature, type MapMouseEvent } from "maplibre-gl";
import { cssVar, h } from "../app/dom";
import "./hazards.css";

// Hazard and ground layers on the address map, plus the "Kartlag" panel to switch them on and off.
// Naturfare (NVE): quick clay, flood, rockfall, debris slides, snow avalanches. Start ON.
// Grunn og geologi (NGU): radon, soil, bedrock. They cover everything, so they start OFF.
// Støy (Statens vegvesen): T-1442 noise zones and the strategic noise map. Large areas, so they start OFF too.
// The tables are large: we fetch only the current view, refetch on moveend (debounced), and only from MIN_ZOOM in.
// To add a layer: one entry in layerGroups(). Map layers, panel row, legend and popup are built from it.

const MIN_ZOOM = 11;
const LIMIT = 1000;
const FILL_OPACITY = 0.3;

type Cls = { label: string; color: string; hatched?: boolean };
type MapLayer = {
  id: string;
  label: string;
  endpoint: string;
  on: boolean;
  classes: Cls[];
  fillColor: ExpressionSpecification | string;
  lineColor?: ExpressionSpecification | string;
  fillOpacity?: ExpressionSpecification;
  /** Features matching this get a diagonal hatch on top, in hatchColor. */
  hatch?: { filter: ExpressionSpecification; color: string };
  filter?: ExpressionSpecification;
  sortKey?: ExpressionSpecification;
  /** Draw as circles (point data) instead of polygons. */
  circle?: boolean;
  /** Fetch and show only from this zoom in (default MIN_ZOOM). */
  minZoom?: number;
  /** Max features per fetch (default LIMIT). */
  limit?: number;
  /** Legend in three columns instead of two (long lists of very short labels). */
  legendCols3?: boolean;
  /** Thinner, fainter outlines for layers made of many small polygons. */
  faintLines?: boolean;
  /** Which of several overlapping hits to show in the popup (default: the top one). */
  pick?: (hits: MapGeoJSONFeature[]) => MapGeoJSONFeature;
  facts: (f: MapGeoJSONFeature) => HTMLElement;
};
type Group = { title: string; layers: MapLayer[] };

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

const str = (key: string): ExpressionSpecification => ["to-string", ["get", key]];
const isTrue = (key: string): ExpressionSpecification => ["==", ["get", key], true];

function layerGroups(): Group[] {
  const bad = cssVar("--bad");
  const warn = cssVar("--warn");
  const surface = cssVar("--surface");
  const teal = cssVar("--teal");
  const navy = cssVar("--navy");
  const gold = cssVar("--gold");
  const water = cssVar("--map-water");
  const unknown = cssVar("--unknown");
  const green = cssVar("--green");
  const good = cssVar("--good");

  // ---- Heritage and nature ----
  const heritage = { fredet: mix(navy, surface, 0.1), other: mix(navy, surface, 0.6) };
  const protectedArea = mix(green, good, 0.5);
  const recreation = mix(teal, green, 0.4);
  const well = mix(gold, navy, 0.5);

  // ---- Quick clay ----
  const clay = { hoy: bad, middels: warn, lav: mix(warn, surface, 0.45) };
  const faregrad: ExpressionSpecification = ["downcase", str("faregrad")];

  // ---- Flood: darker for the more frequent floods, 10-year teal, 200-year the map water colour ----
  const flood: [number, string][] = [
    [10, teal],
    [20, mix(teal, water, 0.25)],
    [50, mix(teal, water, 0.5)],
    [100, mix(teal, water, 0.7)],
    [200, mix(teal, water, 0.85)],
  ];
  const interval: ExpressionSpecification = ["to-number", ["get", "gjentaksintervall"], 0];
  const floodStep = (colors: [number, string][]): ExpressionSpecification => [
    "step",
    interval,
    colors[0][1],
    ...colors.slice(1).flatMap(([years, color]) => [years, color] as [number, string]),
  ];

  // ---- Rockfall, debris slides, avalanches ----
  const rock = { release: mix(bad, navy, 0.3), runout: mix(bad, surface, 0.35) };
  const debris = mix(gold, navy, 0.3);
  const snow = { forest: navy, open: mix(navy, surface, 0.5) };

  // ---- Radon ----
  const radon = { lav: mix(warn, surface, 0.55), middels: warn, hoy: bad, megetHoy: mix(bad, navy, 0.35) };
  const aktsomhet = str("aktsomhet");

  // ---- Road noise: T-1442 zones (red/yellow), and the strategic map in 5 dB bands (50 = 50–55, ..., 75 = 75+) ----
  const isRed: ExpressionSpecification = ["==", ["slice", ["downcase", str("stoysone")], 0, 1], "r"];
  const lden: ExpressionSpecification = ["to-number", ["get", "lden"], 0];
  const noise: [number, string][] = [
    [50, mix(gold, surface, 0.45)],
    [55, gold],
    [60, warn],
    [65, mix(warn, bad, 0.5)],
    [70, bad],
    [75, mix(bad, navy, 0.4)],
  ];

  // ---- Area score: red under 30, yellow at 60, green from 90 (data/scripts/zz_omradescore.ts) ----
  const score: ExpressionSpecification = ["to-number", ["get", "score"], 0];
  const scoreColor: ExpressionSpecification = ["interpolate", ["linear"], score, 30, bad, 60, warn, 90, good];

  return [
    {
      title: "Områdescore",
      layers: [
        {
          id: "omradescore",
          label: "Score for området",
          endpoint: "/api/omradescore",
          on: false,
          minZoom: 8,
          limit: 10000,
          classes: [
            { label: "90+ svært godt", color: good },
            { label: "60 middels", color: warn },
            { label: "Under 30 svakt", color: bad },
            { label: "Ingen farge: få bor der", color: surface },
          ],
          fillColor: scoreColor,
          lineColor: "rgba(0,0,0,0)", // a grid of outlines would hide the map
          fillOpacity: ["interpolate", ["linear"], ["zoom"], 8, 0.55, 14, 0.35], // stronger zoomed out, lighter over streets
          facts: (f) => {
            const p = f.properties;
            return item(
              `Score for området: ${Number(p.score)}/100`,
              p.capText ? `Begrenset av: ${String(p.capText).charAt(0).toLowerCase()}${String(p.capText).slice(1)}` : null,
              `Beregnet for midten av ruten (500 × 500 m), basert på ${Number(p.present)} av ${Number(p.expected)} datapunkter. Søk opp adressen for nøyaktig score.`,
              sourceLine(f),
            );
          },
        },
      ],
    },
    {
      title: "Naturfare",
      layers: [
        {
          id: "kvikkleire",
          label: "Kvikkleire",
          endpoint: "/api/nve_kvikkleire",
          on: true,
          classes: [
            { label: "Høy faregrad", color: clay.hoy },
            { label: "Middels faregrad", color: clay.middels },
            { label: "Lav faregrad", color: clay.lav },
          ],
          fillColor: ["match", faregrad, "høy", clay.hoy, "middels", clay.middels, clay.lav],
          filter: ["match", faregrad, ["høy", "middels", "lav"], true, false],
          sortKey: ["match", faregrad, "høy", 3, "middels", 2, 1], // highest hazard on top
          facts: clayFacts,
        },
        {
          id: "flom",
          label: "Flom",
          endpoint: "/api/flomsoner",
          on: true,
          classes: [
            ...flood.map(([years, color]) => ({ label: `${years}-årsflom`, color })),
            { label: "Lavpunkt", color: teal, hatched: true },
          ],
          fillColor: floodStep(flood),
          // The pale zones need a darker outline to read on the cream land and the blue water.
          lineColor: floodStep(flood.map(([years, color]) => [years, mix(color, teal, 0.5)])),
          // Low points (below flood level, not directly connected to the river): lighter fill plus a hatch.
          fillOpacity: ["case", isTrue("lowPoint"), FILL_OPACITY / 2, FILL_OPACITY],
          hatch: { filter: isTrue("lowPoint"), color: teal },
          sortKey: ["-", 0, interval], // larger return periods first, so the 10-year zone ends up on top
          pick: (hits) => [...hits].sort((a, b) => Number(a.properties.gjentaksintervall) - Number(b.properties.gjentaksintervall))[0],
          facts: floodFacts,
        },
        {
          id: "steinsprang",
          label: "Steinsprang",
          endpoint: "/api/steinsprang",
          on: true,
          classes: [
            { label: "Utløsning (steinen løsner)", color: rock.release },
            { label: "Utløp (steinen lander)", color: rock.runout },
          ],
          fillColor: ["match", str("zone"), "utløsning", rock.release, rock.runout],
          sortKey: ["match", str("zone"), "utløsning", 2, 1],
          facts: (f) =>
            item(
              f.properties.zone === "utløsning" ? "Steinsprang, utløsningsområde" : "Steinsprang, utløpsområde",
              f.properties.zone === "utløsning" ? "Her kan stein løsne fra fjellet." : "Her kan stein som løsner, lande.",
              "Aktsomhetsområde: mulig fare, ikke kartlagt i detalj.",
              f.properties.quality ? `Kvalitet på kartet: ${String(f.properties.quality).toLowerCase()}` : null,
              sourceLine(f),
            ),
        },
        {
          id: "jordflomskred",
          label: "Jord- og flomskred",
          endpoint: "/api/jordflomskred",
          on: true,
          classes: [{ label: "Aktsomhetsområde", color: debris }],
          fillColor: debris,
          facts: (f) =>
            item(
              "Jord- og flomskred",
              "Område der jord, stein og vann kan skli ut, ofte etter mye regn.",
              "Aktsomhetsområde: mulig fare, ikke kartlagt i detalj.",
              sourceLine(f),
            ),
        },
        {
          id: "snoskred",
          label: "Snøskred",
          endpoint: "/api/snoskred",
          on: true,
          classes: [
            { label: "Med dagens skog", color: snow.forest },
            { label: "Bare uten skog", color: snow.open },
          ],
          fillColor: ["case", isTrue("forestEffect"), snow.forest, snow.open],
          sortKey: ["case", isTrue("forestEffect"), 2, 1],
          facts: (f) =>
            item(
              "Snøskred",
              f.properties.forestEffect === true
                ? "Snøskred kan nå hit selv med skogen som står her i dag."
                : "Snøskred kan nå hit bare hvis skogen blir borte.",
              "Aktsomhetsområde: mulig fare, ikke kartlagt i detalj.",
              sourceLine(f),
            ),
        },
      ],
    },
    {
      title: "Grunn og geologi",
      layers: [
        {
          id: "radon",
          label: "Radon",
          endpoint: "/api/radon",
          on: false,
          classes: [
            { label: "Lav", color: radon.lav },
            { label: "Middels", color: radon.middels },
            { label: "Høy", color: radon.hoy },
            { label: "Meget høy", color: radon.megetHoy },
          ],
          fillColor: ["match", aktsomhet, "megetHøy", radon.megetHoy, "høy", radon.hoy, "middels", radon.middels, radon.lav],
          facts: (f) =>
            item(
              `Radon, aktsomhet ${radonLabel(String(f.properties.aktsomhet ?? f.properties.name ?? "")).toLowerCase()}`,
              "Hvor sannsynlig det er med mye radon i inneluften. Bare en måling i boligen gir svaret.",
              f.properties.method ? `Metode: ${String(f.properties.method)}` : null,
              sourceLine(f),
            ),
        },
        {
          id: "losmasser",
          label: "Løsmasser",
          endpoint: "/api/losmasser",
          on: false,
          classes: [
            { label: "Marin leire", color: warn },
            { label: "Andre løsmasser", color: unknown },
          ],
          fillColor: ["case", isTrue("marineClay"), warn, unknown],
          sortKey: ["case", isTrue("marineClay"), 2, 1],
          faintLines: true,
          facts: (f) =>
            item(
              f.properties.marineClay === true ? "Løsmasser: marin leire" : "Løsmasser",
              f.properties.name ? String(f.properties.name) : null,
              f.properties.marineClay === true ? "Leire avsatt i havet. Det er her kvikkleire kan finnes." : null,
              sourceLine(f),
            ),
        },
        {
          id: "berggrunn",
          label: "Berggrunn",
          endpoint: "/api/berggrunn",
          on: false,
          classes: [
            { label: "Bergart (NGUs farger)", color: gold },
            { label: "Alunskifer", color: bad, hatched: true },
          ],
          // NGU's own map colour per rock type: the one exception to the "tokens only" rule.
          fillColor: ["to-color", ["coalesce", ["get", "color"], unknown]],
          hatch: { filter: isTrue("alumShale"), color: bad },
          faintLines: true,
          facts: (f) =>
            item(
              f.properties.alumShale === true ? "Berggrunn: alunskifer" : "Berggrunn",
              f.properties.name ? String(f.properties.name) : null,
              f.properties.alumShale === true
                ? "Alunskifer kan svelle og skade grunnmuren, og gir sur avrenning når den graves opp."
                : null,
              sourceLine(f),
            ),
        },
      ],
    },
    {
      title: "Støy",
      layers: [
        {
          id: "veistoy",
          label: "Støysoner, vei",
          endpoint: "/api/veistoy",
          on: false,
          classes: [
            { label: "Rød sone", color: bad },
            { label: "Gul sone", color: gold },
          ],
          fillColor: ["case", isRed, bad, gold],
          sortKey: ["case", isRed, 2, 1], // red on top
          facts: (f) => {
            const red = String(f.properties.stoysone ?? "").toLowerCase().startsWith("r");
            return item(
              red ? "Rød støysone fra vei" : "Gul støysone fra vei",
              red
                ? "Mye støy fra veien. Her skal det som hovedregel ikke bygges nye boliger."
                : "Merkbar støy fra veien. Nye boliger her må ha støytiltak.",
              f.properties.forecastYear ? `Beregnet for trafikken i ${String(f.properties.forecastYear)}.` : null,
              "Dekker bare riks- og fylkesveier.",
              sourceLine(f),
            );
          },
        },
        {
          id: "stoyStrategisk",
          label: "Støykart, vei",
          endpoint: "/api/stoy_strategisk",
          on: false,
          classes: noise.map(([db, color]) => ({ label: db >= 75 ? "75+ dB" : `${db} dB`, color })), // where each 5 dB band starts
          fillColor: ["step", lden, noise[0][1], ...noise.slice(1).flatMap(([db, color]) => [db, color] as [number, string])],
          sortKey: lden, // loudest on top
          legendCols3: true,
          faintLines: true,
          facts: (f) => {
            const db = Number(f.properties.lden);
            return item(
              `Veistøy ${db >= 75 ? "over 75" : `${db}–${db + 5}`} dB`,
              "Gjennomsnittlig støy over døgnet (Lden), med kveld og natt vektet tyngre.",
              f.properties.year ? `Strategisk støykart, ${String(f.properties.year)}.` : null,
              sourceLine(f),
            );
          },
        },
        {
          id: "flystoy",
          label: "Støysoner, fly",
          endpoint: "/api/flystoy",
          on: false,
          classes: [
            { label: "Rød sone", color: bad },
            { label: "Gul sone", color: gold },
          ],
          fillColor: ["case", isRed, bad, gold],
          sortKey: ["case", isRed, 2, 1], // yellow first, red on top
          facts: (f) => {
            const red = String(f.properties.stoysone ?? "").toLowerCase().startsWith("r");
            return item(
              red ? "Rød støysone fra fly" : "Gul støysone fra fly",
              red
                ? "Mye flystøy. Her skal det som hovedregel ikke bygges nye boliger."
                : "Merkbar flystøy. Nye boliger her må ha støytiltak.",
              f.properties.airport ? `Flyplass: ${String(f.properties.airport)}` : null,
              f.properties.year ? `Beregnet for ${String(f.properties.year)}.` : null,
              sourceLine(f),
            );
          },
        },
      ],
    },
    {
      title: "Kulturminner og natur",
      layers: [
        {
          id: "kulturminner",
          label: "Kulturminner",
          endpoint: "/api/kulturminner",
          on: false,
          classes: [
            { label: "Fredet", color: heritage.fredet },
            { label: "Andre kulturminner", color: heritage.other },
          ],
          fillColor: ["case", isTrue("fredet"), heritage.fredet, heritage.other],
          sortKey: ["case", isTrue("fredet"), 2, 1], // protected on top
          facts: (f) => {
            const p = f.properties;
            const link =
              typeof p.link === "string" && /^https?:\/\//.test(p.link)
                ? h("a", { href: p.link, target: "_blank", rel: "noopener" }, "Se i Kulturminnesøk")
                : null;
            return item(
              p.name ? String(p.name) : "Kulturminne",
              p.kind ? `Type: ${String(p.kind)}` : null,
              p.status ? `Status: ${String(p.status)}` : null,
              `Fredet: ${p.fredet === true ? "ja" : "nei"}`,
              link,
              sourceLine(f),
            );
          },
        },
        {
          id: "verneomrader",
          label: "Verneområder",
          endpoint: "/api/verneomrader",
          on: false,
          classes: [{ label: "Verneområde", color: protectedArea }],
          fillColor: protectedArea,
          facts: (f) =>
            item(
              f.properties.name ? String(f.properties.name) : "Verneområde",
              f.properties.protectionType ? `Vernetype: ${String(f.properties.protectionType)}` : null,
              sourceLine(f),
            ),
        },
        {
          id: "friluftsomrader",
          label: "Friluftsområder",
          endpoint: "/api/friluftsomrader",
          on: false,
          classes: [{ label: "Statlig sikret friluftsområde", color: recreation }],
          fillColor: recreation,
          facts: (f) =>
            item(
              f.properties.name ? String(f.properties.name) : "Friluftsområde",
              "Statlig sikret friluftsområde.",
              // Descriptions are whole paragraphs: keep the popup short.
              f.properties.description ? shorten(String(f.properties.description), 160) : null,
              sourceLine(f),
            ),
        },
        {
          id: "energibronner",
          label: "Energibrønner",
          endpoint: "/api/energibronner",
          on: false,
          circle: true,
          minZoom: 15,
          classes: [{ label: "Energibrønn (fra zoom 15)", color: well }],
          fillColor: well,
          facts: (f) => {
            const p = f.properties;
            return item(
              "Energibrønn",
              p.drilledM != null ? `Boret ${Number(p.drilledM)} m dypt` : null,
              p.depthToBedrockM != null ? `Dybde til fjell: ${Number(p.depthToBedrockM)} m` : null,
              p.drillYear ? `Boret ${String(p.drillYear)}` : null,
              p.use ? `Bruk: ${String(p.use)}` : null,
              sourceLine(f),
            );
          },
        },
      ],
    },
  ];
}

const emptyData = { type: "FeatureCollection" as const, features: [] };

/** Set by pick.ts: gets every map click with the hazard blocks for that spot (maybe none) and owns the popup. */
export const clickHook: { current?: (e: MapMouseEvent, blocks: HTMLElement[]) => void } = {};

// Quiet mode for pages with their own task on the map (/finn): the panel folds away and every layer goes off.
// Leaving quiet mode puts back the layers and the panel as they were. Nothing of this is saved in localStorage.
let quiet = false;
let applyQuiet: ((on: boolean) => void) | undefined;
export function setQuietLayers(on: boolean) {
  if (quiet === on) return;
  quiet = on;
  applyQuiet?.(on);
}

export default function (map: Map) {
  const groups = layerGroups();
  const layers = groups.flatMap((g) => g.layers);
  const visible: Record<string, boolean> = Object.fromEntries(layers.map((L) => [L.id, L.on]));
  // Started in quiet mode (the map was first made on /finn): start with everything off, and keep the defaults to restore.
  let beforeQuiet: { visible: Record<string, boolean>; collapsed: boolean } | undefined;
  if (quiet) {
    beforeQuiet = { visible: { ...visible }, collapsed: true };
    for (const id of Object.keys(visible)) visible[id] = false;
  }
  const inputs: Record<string, HTMLInputElement> = {}; // the panel's checkboxes, by layer id
  const aborts: Record<string, AbortController | undefined> = {};
  const status: Record<string, HTMLElement> = {};

  // Bottom to top: ground layers first, quick clay last (the sharpest warning).
  for (const L of [...layers].reverse()) addMapLayers(map, L, visible[L.id]);
  const fillIds = layers.map((L) => `hz-${L.id}-fill`);

  // ---------- Data ----------
  async function load(L: MapLayer) {
    aborts[L.id]?.abort();
    const source = map.getSource<GeoJSONSource>(`hz-${L.id}`);
    if (!source) return;
    setStatus(L, "");
    if (!visible[L.id] || map.getZoom() < (L.minZoom ?? MIN_ZOOM)) {
      source.setData(emptyData);
      return;
    }
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(",");
    const ctrl = new AbortController();
    aborts[L.id] = ctrl;
    busy(1);
    try {
      const limit = L.limit ?? LIMIT;
      const res = await fetch(`${L.endpoint}?bbox=${bbox}&limit=${limit}`, { signal: ctrl.signal });
      if (res.status === 503) {
        // Table not loaded yet on this machine (npm run ingest <name>).
        setStatus(L, "Ikke tilgjengelig");
        source.setData(emptyData);
        return;
      }
      if (!res.ok) {
        console.warn(`${L.id}: HTTP ${res.status}`, await res.text());
        return;
      }
      const data = await res.json();
      if (ctrl.signal.aborted) return;
      source.setData(data);
      if (Array.isArray(data.features) && data.features.length >= limit) setStatus(L, "Zoom inn for alle");
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.warn(`${L.id}: fetch failed`, err);
    } finally {
      busy(-1);
    }
  }

  // "Laster faresoner …" on the map while zones are fetched, so an empty map right after the fly-in
  // doesn't read as "no hazard". Hides once the map has drawn the new data.
  const loading = document.createElement("div");
  loading.className = "hz-loading";
  loading.setAttribute("role", "status");
  loading.textContent = "Laster faresoner …";
  loading.hidden = true;
  map.getContainer().append(loading);
  let pending = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  function busy(d: number) {
    pending = Math.max(0, pending + d);
    if (pending > 0) {
      if (loading.hidden && !showTimer) showTimer = setTimeout(() => ((loading.hidden = false), (showTimer = undefined)), 200);
      return;
    }
    // Drawing big zones takes time too: keep the timer running until the map is idle.
    map.once("idle", () => {
      if (pending > 0) return;
      clearTimeout(showTimer);
      showTimer = undefined;
      loading.hidden = true;
    });
  }

  function setStatus(L: MapLayer, text: string) {
    const el = status[L.id];
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  }

  const loadAll = () => {
    for (const L of layers) void load(L);
    updateZoomNote();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  map.on("moveend", () => {
    clearTimeout(timer);
    timer = setTimeout(loadAll, 250);
  });

  // ---------- Popup ----------
  const popup = new Popup({ className: "hz-popup", maxWidth: "18rem" });

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: fillIds.filter((id) => map.getLayer(id)) });
    // One block per layer, in panel order: the most serious zone of each.
    const blocks = layers.flatMap((L) => {
      const mine = hits.filter((f) => f.layer.id === `hz-${L.id}-fill`);
      return mine.length ? [L.facts(L.pick ? L.pick(mine) : mine[0])] : [];
    });
    // pick.ts takes over the click (also with no hits) and shows one popup: these blocks plus the nearest address.
    if (clickHook.current) {
      popup.remove();
      clickHook.current(e, blocks);
      return;
    }
    if (!blocks.length) return;
    popup.setLngLat(e.lngLat).setDOMContent(h("div", { class: "hz-popup__body" }, ...blocks)).addTo(map);
  });
  for (const id of fillIds) {
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }

  // ---------- Panel ----------
  const container = map.getContainer();
  container.querySelector(".hz-panel")?.remove();
  const zoomNote = h("p", { class: "hz-panel__note", hidden: true }, "Zoom inn for å se sonene.");
  const STORE = "omnium.kartlag.collapsed";
  let collapsed = true; // collapsed unless the user has chosen otherwise
  try {
    const stored = localStorage.getItem(STORE);
    if (stored != null) collapsed = stored === "1";
  } catch {
    /* private mode: fine */
  }
  if (beforeQuiet) {
    beforeQuiet.collapsed = collapsed;
    collapsed = true;
  }
  const count = h("span", { class: "hz-panel__count" });
  const toggle = h("button", { class: "hz-panel__toggle", type: "button", "aria-controls": "hz-panel-body" });
  const applyCollapsed = () => {
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "Vis kartlag" : "Skjul kartlag");
    toggle.textContent = collapsed ? "▸" : "▾";
    const n = Object.values(visible).filter(Boolean).length;
    count.textContent = collapsed ? ` · ${n} på` : "";
    panel.classList.toggle("is-collapsed", collapsed);
    body.hidden = collapsed;
  };
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    if (quiet) return applyCollapsed(); // a choice made in quiet mode is not remembered
    try {
      localStorage.setItem(STORE, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    applyCollapsed();
  });
  const body = h("div", { class: "hz-panel__body", id: "hz-panel-body" });
  const panel = h(
    "section",
    { class: "hz-panel", "aria-labelledby": "hz-panel-title" },
    h("div", { class: "hz-panel__head" }, h("h2", { class: "hz-panel__title", id: "hz-panel-title" }, "Kartlag", count), toggle),
    body,
  );
  body.append(
    ...groups.map((g) =>
      h(
        "fieldset",
        { class: "hz-panel__group" },
        h("legend", { class: "hz-panel__group-title" }, g.title),
        ...g.layers.map((L) => layerRow(L)),
      ),
    ),
    zoomNote,
  );
  applyCollapsed();
  panel.addEventListener("click", (e) => {
    const target = e.target as Element;
    if (collapsed || target.closest(".hz-panel__head")) toggle.click();
  });
  container.append(panel);
  panel.classList.toggle("is-quiet", quiet);

  // Quiet mode on: remember the layers and the panel, then fold it and switch every layer off. Off: put them back.
  applyQuiet = (on) => {
    if (on) {
      beforeQuiet = { visible: { ...visible }, collapsed };
      for (const L of layers) setVisible(L, false);
      collapsed = true;
    } else if (beforeQuiet) {
      for (const L of layers) setVisible(L, beforeQuiet.visible[L.id] ?? L.on);
      collapsed = beforeQuiet.collapsed;
      beforeQuiet = undefined;
    }
    panel.classList.toggle("is-quiet", on);
    applyCollapsed();
  };
  map.once("remove", () => {
    applyQuiet = undefined;
  });

  function setVisible(L: MapLayer, on: boolean) {
    if (inputs[L.id]) inputs[L.id].checked = on;
    if (visible[L.id] === on) return;
    visible[L.id] = on;
    const v = on ? "visible" : "none";
    for (const part of ["fill", "line", "hatch"]) {
      if (map.getLayer(`hz-${L.id}-${part}`)) map.setLayoutProperty(`hz-${L.id}-${part}`, "visibility", v);
    }
    if (!on) popup.remove();
    void load(L);
  }

  function layerRow(L: MapLayer): HTMLElement {
    const input = h("input", { type: "checkbox", id: `hz-toggle-${L.id}`, checked: visible[L.id] });
    inputs[L.id] = input;
    input.addEventListener("change", () => {
      visible[L.id] = !input.checked; // setVisible() flips it and does the rest
      setVisible(L, input.checked);
      applyCollapsed();
    });
    status[L.id] = h("span", { class: "hz-panel__status", hidden: true });
    // A single-class layer needs no legend: the swatch in the row says it all.
    const legend =
      L.classes.length > 1
        ? h(
            "ul",
            {
              // Long lists of short labels go in two columns.
              class: L.legendCols3
                ? "hz-panel__legend hz-panel__legend--cols hz-panel__legend--cols3"
                : L.classes.length > 3
                  ? "hz-panel__legend hz-panel__legend--cols"
                  : "hz-panel__legend",
              "aria-label": `Klasser for ${L.label.toLowerCase()}`,
            },
            ...L.classes.map((c) => h("li", {}, swatch(c), c.label)),
          )
        : null;
    return h(
      "div",
      { class: "hz-panel__layer" },
      h("label", { class: "hz-panel__row", for: `hz-toggle-${L.id}` }, input, swatch(L.classes[0]), L.label, status[L.id]),
      legend,
    );
  }

  function updateZoomNote() {
    zoomNote.hidden = map.getZoom() >= MIN_ZOOM;
  }

  map.once("remove", () => {
    clearTimeout(timer);
    for (const c of Object.values(aborts)) c?.abort();
    clearTimeout(showTimer);
    panel.remove();
    loading.remove();
  });

  loadAll();
}

function addMapLayers(map: Map, L: MapLayer, on: boolean) {
  const visibility = on ? "visible" : "none";
  const filter = L.filter ? { filter: L.filter } : {};
  map.addSource(`hz-${L.id}`, { type: "geojson", data: emptyData });
  if (L.circle) {
    // Point data: one circle layer, named like the fill layer so clicks and the panel treat it the same.
    map.addLayer({
      id: `hz-${L.id}-fill`,
      type: "circle",
      source: `hz-${L.id}`,
      layout: { visibility },
      paint: {
        "circle-color": L.fillColor,
        "circle-opacity": 0.6,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 3, 18, 6],
        "circle-stroke-color": L.fillColor,
        "circle-stroke-width": 1,
      },
    });
    return;
  }
  map.addLayer({
    id: `hz-${L.id}-fill`,
    type: "fill",
    source: `hz-${L.id}`,
    ...filter,
    layout: { visibility, ...(L.sortKey ? { "fill-sort-key": L.sortKey } : {}) },
    paint: { "fill-color": L.fillColor, "fill-opacity": L.fillOpacity ?? FILL_OPACITY },
  });
  if (L.hatch) {
    const image = `hz-hatch-${L.id}`;
    if (!map.hasImage(image)) map.addImage(image, hatchImage(L.hatch.color), { pixelRatio: 2 });
    map.addLayer({
      id: `hz-${L.id}-hatch`,
      type: "fill",
      source: `hz-${L.id}`,
      filter: L.filter ? ["all", L.filter, L.hatch.filter] : L.hatch.filter,
      layout: { visibility },
      paint: { "fill-pattern": image, "fill-opacity": 0.8 },
    });
  }
  map.addLayer({
    id: `hz-${L.id}-line`,
    type: "line",
    source: `hz-${L.id}`,
    ...filter,
    layout: { visibility, ...(L.sortKey ? { "line-sort-key": L.sortKey } : {}) },
    paint: {
      "line-color": L.lineColor ?? L.fillColor,
      "line-width": L.faintLines ? 0.5 : 1,
      "line-opacity": L.faintLines ? 0.6 : 0.9,
    },
  });
}

/** Diagonal stripes on transparent, drawn at 2x for sharp lines. */
function hatchImage(color: string): ImageData {
  const size = 16;
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.canvas.width = ctx.canvas.height = size;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "square";
  ctx.beginPath();
  // One stripe through the middle plus the two corner pieces, so the tiles join seamlessly.
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.moveTo(size / 2, size * 1.5);
  ctx.lineTo(size * 1.5, size / 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function swatch(c: Cls): HTMLElement {
  const el = h("span", { class: c.hatched ? "hz-swatch hz-swatch--hatched" : "hz-swatch", "aria-hidden": "true" });
  el.style.setProperty("--hz-color", c.color);
  return el;
}

function item(title: string, ...lines: (string | HTMLElement | null)[]): HTMLElement {
  return h(
    "div",
    { class: "hz-popup__item" },
    h("strong", {}, title),
    ...lines.map((l) => (typeof l === "string" ? h("span", {}, l) : l)),
  );
}

function sourceLine(f: MapGeoJSONFeature): HTMLElement | null {
  return f.properties.source ? h("span", { class: "hz-popup__source" }, `Kilde: ${String(f.properties.source)}`) : null;
}

/** Cut at the last word before `max` characters and add an ellipsis. */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max)} …`;
}

function radonLabel(a: string): string {
  return ({ lav: "Lav", middels: "Middels", høy: "Høy", megetHøy: "Meget høy" } as Record<string, string>)[a] ?? a;
}

function clayFacts(f: MapGeoJSONFeature): HTMLElement {
  const p = f.properties;
  const link =
    typeof p.reportUrl === "string" && /^https?:\/\//.test(p.reportUrl)
      ? h("a", { href: p.reportUrl, target: "_blank", rel: "noopener" }, "Les rapporten hos NVE")
      : null;
  return item(
    `Kvikkleire, faregrad ${String(p.faregrad ?? "").toLowerCase()}`,
    p.name ? String(p.name) : null,
    p.konsekvens ? `Konsekvens: ${String(p.konsekvens).toLowerCase()}` : null,
    p.risikoklasse !== undefined && p.risikoklasse !== null ? `Risikoklasse ${p.risikoklasse} av 5` : null,
    link,
  );
}

function floodFacts(f: MapGeoJSONFeature): HTMLElement {
  // The name is only "20-årsflom (fs002_37)": the interval plus an internal id, so we leave it out.
  return item(
    `Flomsone, ${f.properties.gjentaksintervall}-årsflom`,
    f.properties.lowPoint === true ? "Lavpunkt: lavere enn flomnivået, men ikke direkte knyttet til elva." : null,
  );
}
