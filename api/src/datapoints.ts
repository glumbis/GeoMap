// What the address profile asks about. Standard: docs/PROFILE.md.
//
// Add a dataset to the profile = add ONE entry to DATA_POINTS below (and its source to SOURCES if new).
// Nothing else to edit: profile.ts runs every entry, rating.ts scores them, the web app renders them.
//
// Entries whose table is not loaded yet show up as "missing: notLoaded". Table and column names on those
// are proposals: when you ingest the dataset, fix the entry to match your table (or name the table to match).
// UI text (labels, display, warnings, reasons) is Norwegian bokmål.

import type { Address } from "./address.ts";

export type Effect = "good" | "neutral" | "bad";
export type Severity = "high" | "medium" | "low";
export type Row = Record<string, unknown>;

export interface Category {
  id: string;
  name: string;
  /** Share of the overall score, relative to the other categories. */
  weight: number;
  /** If a required category can't be rated, the overall can't be rated either. */
  required: boolean;
}

export interface Source {
  id: string;
  name: string;
  owner: string;
  url: string;
  licence: string;
}

/** What read() makes of the rows it got. */
export interface Reading {
  value: unknown;
  display: string;
  unit?: string;
  effect: Effect;
  /** 0-100. Left out: good = 100, bad = 0, neutral = not scored. */
  score?: number;
  /**
   * A finding serious enough to show at the top. high/medium cap the score (see rating.ts).
   * check: true marks a common thing to check (radon, awareness areas), not a hazard finding: it never caps, it is
   * listed under the profile's `checks` instead of `warnings`, and `sameArea` (fixed SQL on the data point's table)
   * picks the rows that count as "the same", so the profile can say how much of the municipality shares it.
   */
  warning?: { severity: Severity; text: string; check?: true; sameArea?: string };
  /** Points taken off the overall and the perspectives that use this data point, after caps. For checks that must still count. */
  penalty?: number;
  explanation?: string;
  /** Outside every zone, but one is close (DataPoint.near): how far, and which zone. Info only, never scored. */
  nearestZone?: { distanceM: number; text?: string };
}

/**
 * How to ask the table about the address point. Every row comes back without `geom`.
 * - within:  rows whose geometry contains the point (zones, municipalities).
 * - nearest: the closest row within maxM metres, with an extra `distanceM` column.
 * - around:  every row within radiusM metres, nearest first (max 500), each with `distanceM`.
 */
export type Find = ({ kind: "within" } | { kind: "nearest"; maxM: number } | { kind: "around"; radiusM: number }) & {
  /** Optional extra SQL filter on the table's own columns, e.g. "isPrimary". Fixed text only, never user input. */
  where?: string;
};

export interface DataPoint {
  id: string;
  label: string;
  category: string;
  source: string;
  importance: "critical" | "normal";
  table: string;
  find: Find;
  /**
   * Optional table of the areas the source has mapped (e.g. kvikkleire_kartlagt). The profile then passes
   * `mapped` to read(): true inside a mapped area, false outside, undefined when the table isn't loaded.
   * Use it so "no zone found" only counts as good where someone actually looked.
   */
  coverage?: string;
  /**
   * Id of a more detailed data point for the same hazard (quickClayAwareness -> quickClay). When that one has a
   * warning, this one's check and penalty are dropped, so one hazard is not counted twice. Its score still counts.
   */
  supersededBy?: string;
  /**
   * Hazard zones: when read() says the address is outside every zone (effect "good"), the profile looks for the
   * nearest zone within NEAR_ZONE_M and sets `nearestZone` + ", ca. X m til nærmeste <text(row)>" on the display
   * (", ca. X m unna" when there is no text: the display already names the zone).
   * Explains why a neighbour a few metres away scores far lower. Never changes the score. `where` filters the zones
   * that count (fixed SQL, never user input).
   */
  near?: { text?: (row: Row) => string; where?: string };
  /** rows is [] when nothing was found. Return null when the source has no coverage here. */
  read: (rows: Row[], address: Address, mapped?: boolean) => Reading | null;
}

/** Hazard map with a coverage table: no zone outside the mapped area is unknown, not good. Not scored. */
const NOT_MAPPED: Reading = {
  value: "ikkeKartlagt", display: "Ikke kartlagt her", effect: "neutral",
};

export const CATEGORIES: Category[] = [
  { id: "ground", name: "Grunn og geologi", weight: 20, required: true },
  { id: "hazards", name: "Naturfare", weight: 25, required: true },
  { id: "environment", name: "Miljø", weight: 15, required: false },
  { id: "location", name: "Beliggenhet", weight: 15, required: false },
  { id: "nature", name: "Natur og friluft", weight: 10, required: false },
  { id: "area", name: "Område", weight: 15, required: false },
];

export const SOURCES: Source[] = [
  { id: "geonorge-adresser", name: "Adresser", owner: "Kartverket", url: "https://ws.geonorge.no/adresser/v1/", licence: "CC BY 4.0" },
  { id: "kartverket-kommuner", name: "Kommuner", owner: "Kartverket", url: "https://ws.geonorge.no/kommuneinfo/v1/", licence: "CC BY 4.0" },
  { id: "nve-kvikkleire", name: "Faresoner kvikkleire", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/kvikkleire/a29b905c-6aaa-4283-ae2c-d167624c08a8", licence: "NLOD 2.0" },
  { id: "nve-flomsoner", name: "Flomsoner", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/flomsoner/e95008fc-0945-4d66-8bc9-e50ab3f50401", licence: "NLOD 2.0" },
  { id: "nve-kvikkleire-aktsomhet", name: "Aktsomhetskart for kvikkleireskred", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/aktsomhetskart-for-kvikkleireskred/dabd2a2c-36d5-4ed7-a4c9-d49808a2b848", licence: "NLOD 2.0" },
  { id: "ssb-grunnkretser", name: "Befolkning på grunnkretsnivå", owner: "Kartverket / SSB", url: "https://kartkatalog.geonorge.no/metadata/befolkning-paa-grunnkretsniv/7eb907de-fdaa-4442-a8eb-e4bd06da9ca8", licence: "Åpne data, ingen vilkår" },
  { id: "nve-flomaktsomhet", name: "Aktsomhetsområder flom", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/flom-aktsomhetsomraader/60c5024f-bf93-4d7a-888a-5fe001427195", licence: "NLOD 2.0" },
  { id: "ngu-marin-leire", name: "Mulighet for marin leire", owner: "NGU", url: "https://kartkatalog.geonorge.no/metadata/mulighet-for-marin-leire/641a81c2-9354-473b-b8f0-2b1e2ab3930a", licence: "NLOD 2.0" },
  { id: "nve-steinsprang", name: "Aktsomhetsområder steinsprang", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/steinsprang-aktsomhetsomraader/02c6d51c-4e8c-4948-a620-dc046c8cb747", licence: "NLOD 2.0" },
  { id: "nve-jordflomskred", name: "Aktsomhetsområder jord- og flomskred", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/aktsomhetskart-for-jord-og-flomskred/30e1883e-70e9-4510-9e97-00edbdcddc02", licence: "NLOD 2.0" },
  { id: "nve-snoskred", name: "Aktsomhetskart snøskred (NAKSIN)", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/aktsomhetskart-for-snoeskred/54ada9d8-e6fc-48d6-82b0-5477166a4aaa", licence: "NLOD 2.0" },
  { id: "kartverket-stormflo", name: "Stormflo og havnivå", owner: "Kartverket", url: "https://kartkatalog.geonorge.no/metadata/stormflo-og-havnivaa/fbb95c67-623f-430a-9fa5-9cfcea8366b3", licence: "CC BY 4.0" },
  { id: "ngu-losmasser", name: "Løsmasser", owner: "NGU", url: "https://kartkatalog.geonorge.no/metadata/loesmasser-regionalt/e5847c27-0c30-44b6-9198-a797c177fa20", licence: "NLOD 2.0" },
  { id: "ngu-radon", name: "Radon aktsomhet", owner: "NGU", url: "https://kartkatalog.geonorge.no/metadata/radon-aktsomhet/dc0605f3-2301-4abe-a91f-6da42464c281", licence: "NLOD 2.0" },
  { id: "ngu-berggrunn", name: "Berggrunn N50 / N250", owner: "NGU", url: "https://kartkatalog.geonorge.no/metadata/berggrunn-n50/a5c76d05-33bd-4a1d-b28b-81575092e468", licence: "NLOD 2.0" },
  { id: "svv-stoy", name: "Støykartlegging veg", owner: "Statens vegvesen", url: "https://kartkatalog.geonorge.no/metadata/stoeykartlegging-veg-etter-t-1442/d6db9f39-9725-4630-909e-5e62f09a0766", licence: "NLOD 2.0" },
  { id: "svv-stoy-strategisk", name: "Strategisk støykartlegging veg", owner: "Statens vegvesen", url: "https://kartkatalog.geonorge.no/metadata/stoeykart-strategisk-stykartlegging-stydirektivet/93a154a7-47d5-47b8-bdda-f156d92386cc", licence: "NLOD 2.0" },
  { id: "banenor-stoy", name: "Støysoner for Bane NORs jernbanenett", owner: "Bane NOR", url: "https://kartkatalog.geonorge.no/metadata/stoeysoner-for-bane-nors-jernbanenett/47234f63-a9d1-43c7-b91c-db90c92d5008", licence: "Åpne data, ingen vilkår" },
  { id: "osm", name: "OpenStreetMap (butikker, apotek, legekontor)", owner: "OpenStreetMap-bidragsytere", url: "https://www.openstreetmap.org/copyright", licence: "ODbL 1.0" },
  { id: "avinor-flystoy", name: "Støysoner Avinors lufthavner", owner: "Avinor", url: "https://kartkatalog.geonorge.no/metadata/stoeysoner-avinors-lufthavner/1489f7f8-40c8-4dc4-83b6-bcf277b56506", licence: "Åpne data, ingen vilkår" },
  { id: "mdir-grunnforurensning", name: "Forurenset grunn", owner: "Miljødirektoratet", url: "https://kartkatalog.geonorge.no/metadata/forurenset-grunn/e48e71ac-16fc-4e47-9e7f-c0a4a4bbfad0", licence: "NLOD 2.0" },
  { id: "entur-stopp", name: "Holdeplasser", owner: "Entur", url: "https://developer.entur.org/stops-and-timetable-data", licence: "NLOD 2.0" },
  { id: "udir-skoler", name: "Grunnskoler", owner: "Utdanningsdirektoratet", url: "https://kartkatalog.geonorge.no/metadata/grunnskoler/db4b872f-264d-434c-9574-57232f1e90d2", licence: "NLOD 2.0" },
  { id: "udir-barnehager", name: "Barnehager", owner: "Utdanningsdirektoratet", url: "https://kartkatalog.geonorge.no/metadata/barnehager/e229a364-0caa-4a24-8dbe-225b3d83e075", licence: "NLOD 2.0" },
  { id: "kartverket-turruter", name: "Turrutebasen", owner: "Kartverket", url: "https://kartkatalog.geonorge.no/metadata/turrutebasen/d1422d17-6d95-4ef1-96ab-8af31744dd63", licence: "CC BY 4.0" },
  { id: "ngu-granada", name: "Grunnvannsborehull (Granada), energibrønner", owner: "NGU", url: "https://kartkatalog.geonorge.no/metadata/grunnvannsborehull/82cd33ef-52dd-4c83-b2d6-e55a0941b33b", licence: "NLOD 2.0" },
  { id: "mdir-naturvern", name: "Naturvernområder (Naturbase)", owner: "Miljødirektoratet", url: "https://kartkatalog.geonorge.no/metadata/naturvernomraader/5857ec0a-8d2c-4cd8-baa2-0dc54ae213b4", licence: "NLOD 2.0" },
  { id: "mdir-friluft", name: "Statlig sikra friluftslivsområder", owner: "Miljødirektoratet", url: "https://kart.miljodirektoratet.no/arcgis/rest/services/friluftsliv_statlig_sikra/MapServer/0", licence: "NLOD 2.0" },
  { id: "ra-kulturminner", name: "Kulturminner - Lokaliteter, Enkeltminner og Sikringssoner", owner: "Riksantikvaren", url: "https://kartkatalog.geonorge.no/metadata/kulturminner-lokaliteter-enkeltminner-og-sikringssoner/c72906a0-2bc2-41d7-bea2-c92d368e3c49", licence: "NLOD 2.0" },
  { id: "ssb-inntekt-omrader", name: "Inntekt for husholdninger etter region (tabell 06944, delområde og bydel)", owner: "SSB", url: "https://www.ssb.no/statbank/table/06944", licence: "CC BY 4.0" },
  { id: "ssb-krim", name: "Anmeldte lovbrudd etter gjerningssted (SSB 08487; Oslo per bydel: Oslo kommune KRI002)", owner: "SSB / Oslo kommune", url: "https://www.ssb.no/statbank/table/08487", licence: "CC BY 4.0 / NLOD" },
  { id: "ssb-kommune", name: "Statistikkbanken", owner: "SSB", url: "https://www.ssb.no/statbank", licence: "CC BY 4.0" },
];

// ---- Helpers for common shapes -------------------------------------------------------------

const metres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

const decimal = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/**
 * Crime per 1000 residents (krim_omrader): the Oslo bydel when the address has one (Oslo kommune, with Oslo and Norway
 * next to it), otherwise the municipality (SSB, with Norway next to it).
 * Scored against the national rate (ratio = municipality / Norway): at most 0.6× = 100, ... over 1.8× = 15.
 * Municipal numbers, so no warning and no cap: they say nothing certain about the street. Weighed most in "Familie".
 * Without a national rate there is nothing to compare with: neutral, not scored.
 */
const CRIME_STEPS: [number, number][] = [[0.6, 100], [0.85, 85], [1.1, 70], [1.4, 50], [1.8, 30]];

function crimeReading(rows: Row[], type: "total" | "violence"): Reading | null {
  const r = rows.find((x) => x.level === "bydel") ?? rows[0];
  if (!r) return null;
  const v = r[`${type}Per1000`];
  const count = r[`${type}Count`];
  // Sentrum bydel: about 1 500 residents, so a per-1000 number would be meaningless. Show the count, never scored.
  if (v == null && count != null) {
    return { value: null, display: `${Number(count).toLocaleString("nb-NO")} anmeldt i ${r.name} (${r.period}), få bor der`, effect: "neutral" };
  }
  if (v == null) return null;
  const norway = r[`${type}Per1000Norway`];
  const oslo = r[`${type}Per1000Oslo`];
  const where = r.level === "bydel" ? ` i ${r.name}` : "";
  const compare = [oslo != null ? `Oslo ${decimal(Number(oslo))}` : "", norway != null ? `landet ${decimal(Number(norway))}` : ""].filter(Boolean).join(", ");
  // Ullensaker (3209) counts crime at Oslo lufthavn Gardermoen (e.g. smuggling), which lifts its numbers.
  const isAirport = r.kommunenummer === "3209";
  const airport = isAirport ? ", inkl. Gardermoen" : "";
  const reading: Reading = { value: Number(v), unit: "per 1000 innbyggere", display: `${decimal(Number(v))} per 1000 innbyggere${where} (${r.period})${compare ? `, ${compare}` : ""}${airport}`, effect: "neutral" };
  // Ullensaker's total is mostly airport cases (smuggling, customs), not life in the municipality: shown, not scored.
  // Oslo (0301): one number for 700 000 people says nothing about the bydel, and would score every Oslo address the same.
  // Bydel numbers now exist (row.level 'bydel', Oslo kommune KRI002, scored or not is Lukas's call): still not scored.
  const isOslo = r.kommunenummer === "0301";
  if (norway == null || Number(norway) <= 0 || isOslo || (isAirport && type === "total")) return reading;
  const ratio = Number(v) / Number(norway);
  const score = CRIME_STEPS.find(([max]) => ratio <= max)?.[1] ?? 15;
  return { ...reading, effect: score >= 70 ? "good" : "bad", score };
}

/** "Nearest X" data point: score falls with distance. steps = [[maxMetres, score], ...] ascending. */
function nearestScore(steps: [number, number][]) {
  return (rows: Row[]): Reading => {
    if (!rows.length) {
      const far = steps[steps.length - 1][0];
      return { value: null, display: `Ingen innen ${metres(far)}`, effect: "bad", score: 0 };
    }
    const d = Number(rows[0].distanceM);
    const score = steps.find(([max]) => d <= max)?.[1] ?? 0;
    const name = rows[0].name ? ` (${rows[0].name})` : "";
    return { value: Math.round(d), unit: "m", display: `${metres(d)}${name}`, effect: score >= 50 ? "good" : "bad", score };
  };
}

// ---- The list ------------------------------------------------------------------------------

export const DATA_POINTS: DataPoint[] = [
  // Ground & geology. Proposed tables from NGU (Sverre).
  {
    id: "soilType", label: "Løsmasser", category: "ground", source: "ngu-losmasser", importance: "critical",
    table: "losmasser", find: { kind: "within" }, // data/scripts/losmasser.ts (Sverre): name (soil type), losmassetype, marineClay
    read: (rows) => {
      if (!rows.length) return null; // map has holes: no polygon = no coverage, not "good"
      const r = rows[0];
      const clay = r.marineClay === true;
      return {
        value: r.name, display: String(r.name), effect: clay ? "bad" : "neutral", score: clay ? 40 : 80,
        ...(clay && { warning: { severity: "low" as const, text: "Marin leire i grunnen" } }),
      };
    },
  },
  {
    id: "radon", label: "Radon", category: "ground", source: "ngu-radon", importance: "critical",
    table: "radon", find: { kind: "within" }, // data/scripts/radon.ts (Sverre): aktsomhet ('lav' | 'middels' | 'høy' | 'megetHøy' | 'usikker'), NGU version 2 (2026)
    read: (rows) => {
      if (!rows.length) return null;
      const a = String(rows[0].aktsomhet);
      if (a === "megetHøy") {
        // A check, not a cap: high radon likelihood covers much of Oslo and is cheap to measure. It still costs points.
        return {
          value: a, display: "Meget høy aktsomhet", effect: "bad", score: 15, penalty: 12,
          warning: { severity: "low", text: "Meget høy radonaktsomhet", check: true, sameArea: "aktsomhet = 'megetHøy'" },
        };
      }
      if (a === "høy") {
        return {
          value: a, display: "Høy aktsomhet", effect: "bad", score: 30, penalty: 8,
          warning: { severity: "low", text: "Høy radonaktsomhet", check: true, sameArea: "aktsomhet = 'høy'" },
        };
      }
      if (a === "middels") return { value: a, display: "Middels aktsomhet", effect: "neutral", score: 65 };
      if (a === "lav") return { value: a, display: "Lav aktsomhet", effect: "good", score: 90 };
      return null; // 'usikker' = the source can't say
    },
  },
  {
    id: "bedrock", label: "Berggrunn", category: "ground", source: "ngu-berggrunn", importance: "normal",
    table: "berggrunn", find: { kind: "within" }, // data/scripts/berggrunn.ts (Sverre): name (rock type), legend, alumShale, scale (50000 | 250000)
    read: (rows) => {
      if (!rows.length) return null;
      const r = rows[0];
      const display = `${r.name}${Number(r.scale) === 250000 ? " (oversiktskart)" : ""}`;
      if (r.alumShale === true) {
        return {
          value: r.name, display: `${display}, med alunskifer`, effect: "bad", score: 40,
          warning: { severity: "low", text: "Alunskifer i berggrunnen" },
        };
      }
      // The rock type itself is information, not a judgement: neutral, not scored.
      return { value: r.name, display, effect: "neutral" };
    },
  },
  {
    // data/scripts/marin_leire.ts (Sverre): NGU "mulighet for marin leire", level 5 (svært ofte) .. 0 (stort sett aldri).
    // Quick clay forms in marine clay, so this shows where quick clay is possible, also where NVE has no hazard map.
    // Scored but no warning: the quick-clay hazard zone (quickClay) is what warns.
    // No polygon = above the marine limit or not classified by NGU: neutral, not "good".
    id: "marineClay", label: "Mulighet for marin leire", category: "ground", source: "ngu-marin-leire", importance: "normal",
    table: "marin_leire", find: { kind: "within" },
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Over marin grense eller ikke kartlagt", effect: "neutral" };
      const best = rows.reduce((a, b) => (Number(b.level) > Number(a.level) ? b : a));
      const level = Number(best.level);
      const display: Record<number, string> = {
        5: "Svært ofte marin leire", 4: "Svært ofte marin leire, men usammenhengende eller tynt", 3: "Ofte marin leire",
        2: "Noen ganger marin leire", 1: "Sjelden marin leire", 0: "Stort sett aldri marin leire",
      };
      const score = [100, 85, 65, 45, 35, 20][level];
      return { value: String(best.class), display: display[level], effect: level >= 2 ? "bad" : "good", score };
    },
  },
  {
    // data/scripts/energibronner.ts (Even): NGU Granada energy wells, depthToBedrockM, drilledM. Info only: never scored.
    id: "energyWell", label: "Nærmeste energibrønn", category: "ground", source: "ngu-granada", importance: "normal",
    table: "energibronner", find: { kind: "nearest", maxM: 500 },
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Ingen registrert innen 500 m", effect: "neutral" };
      const d = Number(rows[0].distanceM);
      const rock = rows[0].depthToBedrockM;
      const display = `${metres(d)} unna${rock != null ? `, fjell ${String(Math.round(Number(rock) * 10) / 10).replace(".", ",")} m under bakken` : ""}`;
      return { value: Math.round(d), unit: "m", display, effect: "neutral" };
    },
  },

  // Natural hazards. Proposed tables from NVE (Sverre). No zone inside an area NVE has mapped = "not in a
  // mapped zone", which is real data (good). No zone outside it = not mapped: unknown, never good.
  {
    id: "quickClay", label: "Kvikkleire faresone", category: "hazards", source: "nve-kvikkleire", importance: "critical",
    table: "nve_kvikkleire", find: { kind: "within" }, // data/scripts/nve_kvikkleire.ts (Sverre): name, faregrad ('Høy' | 'Middels' | 'Lav' | 'Ingen'), risikoklasse
    coverage: "kvikkleire_kartlagt", // data/scripts/nve_kartlagt.ts
    near: { where: "lower(faregrad) IN ('høy', 'middels', 'lav')", text: (r) => `kvikkleiresone (faregrad ${String(r.faregrad).toLowerCase()})` },
    read: (rows, _address, mapped) => {
      if (!rows.length) {
        return mapped ? { value: null, display: "Ikke i faresone (kartlagt område)", effect: "good" } : NOT_MAPPED;
      }
      const order = ["høy", "middels", "lav"];
      const graded = rows.filter((r) => order.includes(String(r.faregrad).toLowerCase()));
      if (!graded.length) {
        // NVE zone with faregrad 'Ingen': mapped, but no hazard level given. Not a warning, not scored.
        const sone = rows[0].name ? ` "${rows[0].name}"` : "";
        return { value: "ingen", display: `I kartlagt sone${sone} uten faregrad`, effect: "neutral" };
      }
      const worst = [...graded].sort((a, b) =>
        order.indexOf(String(a.faregrad).toLowerCase()) - order.indexOf(String(b.faregrad).toLowerCase()))[0];
      const grad = String(worst.faregrad).toLowerCase();
      const sone = worst.name ? ` "${worst.name}"` : "";
      const severity: Severity = grad === "høy" ? "high" : grad === "middels" ? "medium" : "low";
      return {
        value: grad, display: `I faresone${sone}, faregrad ${grad}`, effect: "bad",
        score: { high: 0, medium: 30, low: 60 }[severity],
        warning: { severity, text: `Faresone for kvikkleireskred, faregrad ${grad}` },
      };
    },
  },
  {
    id: "flood200", label: "Flomsone (200-årsflom)", category: "hazards", source: "nve-flomsoner", importance: "critical",
    table: "flomsoner", find: { kind: "within" }, // data/scripts/flomsoner.ts (Sverre): gjentaksintervall (10/20/50/100/200), lowPoint
    coverage: "flom_kartlagt", // data/scripts/nve_kartlagt.ts
    near: { text: (r) => `${Number(r.gjentaksintervall) || 200}-årsflomsone` },
    read: (rows, _address, mapped) => {
      if (!rows.length) {
        return mapped ? { value: false, display: "Ikke i flomsone (kartlagt område)", effect: "good" } : NOT_MAPPED;
      }
      const years = Math.min(...rows.map((r) => Number(r.gjentaksintervall) || 200));
      // lavpunkt: below the flood level but not directly connected to the river
      const lowPoint = rows.filter((r) => Number(r.gjentaksintervall) === years).every((r) => r.lowPoint === true);
      // TEK17 §7-2: homes must withstand a 200-year flood, garages and the like a 20-year flood; a 20-year zone fails even the lowest class.
      const high = years <= 20;
      return {
        value: years, unit: "år", display: `I ${years}-årsflomsone${lowPoint ? " (lavpunkt)" : ""}`, effect: "bad", score: high ? 0 : 20,
        ...(lowPoint && { explanation: "Lavpunkt: området ligger lavere enn flomvannstanden, men har ikke direkte forbindelse til elva. Det kan likevel bli oversvømt gjennom kummer, rør eller grunnvann." }),
        warning: { severity: high ? "high" : "medium", text: `Ligger i ${years}-årsflomsone` },
      };
    },
  },
  {
    // data/scripts/kvikkleire_aktsomhet.ts (Sverre): NVE quick-clay slide awareness areas, with NVE's assessed map sheets
    // as coverage. Coarser than quickClay (hazard zones), so a low warning: "possible, check before building".
    id: "quickClayAwareness", label: "Aktsomhetsområde for kvikkleireskred", category: "hazards", source: "nve-kvikkleire-aktsomhet", importance: "normal",
    table: "kvikkleire_aktsomhet", find: { kind: "within" },
    coverage: "kvikkleire_aktsomhet_dekning",
    near: {},
    supersededBy: "quickClay",
    read: (rows, _address, mapped) => {
      if (!rows.length) return mapped ? { value: false, display: "Ikke i aktsomhetsområde for kvikkleireskred", effect: "good" } : NOT_MAPPED;
      // "Not checked yet", not "dangerous": a check with a small penalty.
      return {
        value: true, display: "I aktsomhetsområde for kvikkleireskred", effect: "bad", score: 50, penalty: 3,
        warning: { severity: "low", text: "Aktsomhetsområde for kvikkleireskred", check: true, sameArea: "true" },
      };
    },
  },
  {
    // data/scripts/flomaktsomhet.ts (Sverre): NVE flood awareness areas along all rivers, national coverage.
    // Coarser than flood200 (which is only mapped in some places), so a low warning: "check before building".
    id: "floodAwareness", label: "Aktsomhetsområde for flom", category: "hazards", source: "nve-flomaktsomhet", importance: "normal",
    table: "flomaktsomhet", find: { kind: "within" },
    near: {},
    supersededBy: "flood200",
    read: (rows) =>
      rows.length
        ? {
            value: true, display: "I aktsomhetsområde for flom", effect: "bad", score: 50, penalty: 3,
            warning: { severity: "low", text: "Aktsomhetsområde for flom", check: true, sameArea: "true" },
          }
        : { value: false, display: "Ikke i aktsomhetsområde for flom", effect: "good" },
  },
  {
    id: "rockfall", label: "Steinsprang", category: "hazards", source: "nve-steinsprang", importance: "normal",
    table: "steinsprang", find: { kind: "within" }, // data/scripts/steinsprang.ts (Sverre): zone 'utløsning' (release) | 'utløp' (runout)
    near: {},
    read: (rows) => {
      if (!rows.length) return { value: false, display: "Ikke i aktsomhetsområde", effect: "good" };
      const runout = rows.some((r) => r.zone === "utløp");
      const release = rows.some((r) => r.zone === "utløsning");
      const where = runout && release ? "utløsnings- og utløpsområde" : runout ? "utløpsområde" : "utløsningsområde";
      return {
        value: true, display: `I aktsomhetsområde for steinsprang (${where})`, effect: "bad", score: 30,
        warning: { severity: "medium", text: "Aktsomhetsområde for steinsprang" },
      };
    },
  },
  {
    id: "debrisFlow", label: "Jord- og flomskred", category: "hazards", source: "nve-jordflomskred", importance: "normal",
    table: "jordflomskred", find: { kind: "within" }, // data/scripts/jordflomskred.ts (Sverre)
    near: {},
    read: (rows) =>
      rows.length
        ? {
            value: true, display: "I aktsomhetsområde for jord- og flomskred", effect: "bad", score: 30,
            warning: { severity: "medium", text: "Aktsomhetsområde for jord- og flomskred" },
          }
        : { value: false, display: "Ikke i aktsomhetsområde", effect: "good" },
  },
  {
    id: "avalanche", label: "Snøskred", category: "hazards", source: "nve-snoskred", importance: "normal",
    table: "snoskred", find: { kind: "within" }, // data/scripts/snoskred.ts (Sverre): forestEffect (true = with today's forest)
    near: { text: (r) => (r.forestEffect === true ? "" : "sone (bare uten skog)") },
    read: (rows) => {
      if (!rows.length) return { value: false, display: "Ikke i aktsomhetsområde", effect: "good" };
      if (rows.some((r) => r.forestEffect === true)) {
        return {
          value: "medSkog", display: "I aktsomhetsområde for snøskred", effect: "bad", score: 30,
          warning: { severity: "medium", text: "Aktsomhetsområde for snøskred" },
        };
      }
      // Only in the zone without forest: today's forest protects, but the risk comes back if it is cut.
      return {
        value: "utenSkog", display: "I aktsomhetsområde for snøskred bare uten skog", effect: "bad", score: 70,
        warning: { severity: "low", text: "Snøskred mulig hvis skogen over blir borte" },
      };
    },
  },
  {
    id: "stormSurge", label: "Stormflo", category: "hazards", source: "kartverket-stormflo", importance: "normal",
    table: "stormflo", find: { kind: "within" }, // data/scripts/stormflo.ts (Sverre): years (20 | 200), climate ('nå' | '2100'), waterLevelCm
    near: { where: "climate = 'nå'", text: (r) => `${Number(r.years)}-årsstormflosone` },
    read: (rows) => {
      if (!rows.length) return { value: false, display: "Ikke i stormflosone", effect: "good" };
      const now = rows.filter((r) => r.climate === "nå");
      const cm = (r: Record<string, unknown>) => `${(Number(r.waterLevelCm) / 100).toFixed(1).replace(".", ",")} m over havet (NN2000)`;
      if (now.length) {
        // Today's flooding: the most frequent storm surge that reaches the address.
        const worst = now.reduce((a, b) => (Number(b.years) < Number(a.years) ? b : a));
        const years = Number(worst.years);
        // Same TEK17 §7-2 rule as flood200: a 20-year zone fails even the lowest safety class (F1).
        const high = years <= 20;
        return {
          value: years, unit: "år", display: `I ${years}-årsstormflosone i dag (${cm(worst)})`, effect: "bad", score: high ? 0 : 20,
          warning: { severity: high ? "high" : "medium", text: `Ligger i ${years}-årsstormflosone` },
        };
      }
      // Only flooded with the sea level expected in 2100.
      return {
        value: 2100, display: `I 200-årsstormflosone i år 2100 (${cm(rows[0])})`, effect: "bad", score: 60,
        warning: { severity: "low", text: "Stormflo i år 2100 med havnivåstigning" },
      };
    },
  },

  // Environment.
  {
    id: "roadNoise", label: "Veistøy (riks- og fylkesvei)", category: "environment", source: "svv-stoy", importance: "normal",
    table: "veistoy", find: { kind: "within" }, // data/scripts/veistoy.ts (Even): stoysone 'rød' | 'gul'
    read: (rows, address) => {
      if (!rows.length) {
        // T-1442 has no data in Oslo: an empty result there means "unknown", not "quiet".
        if (address.municipalityNumber === "0301") return null;
        return { value: null, display: "Ikke i støysone", effect: "good" };
      }
      const red = rows.some((r) => String(r.stoysone).toLowerCase().startsWith("r"));
      return red
        ? { value: "rød", display: "Rød støysone (over 65 dB)", effect: "bad", score: 10, warning: { severity: "medium", text: "Rød støysone fra vei" } }
        : { value: "gul", display: "Gul støysone (55–65 dB)", effect: "bad", score: 50, warning: { severity: "low", text: "Gul støysone fra vei" } };
    },
  },
  {
    // data/scripts/stoy_strategisk.ts (Even): lden = lower bound of a 5 dB band (50, 55, ..., 75 = 75+), situation 2021.
    // Covers Oslo incl. municipal roads; elsewhere only near big roads. No outline of what was mapped,
    // so no zone = unknown (below 50 dB or not mapped), never "quiet".
    // Warns only in Oslo: elsewhere roadNoise (T-1442) already warns, and one noise warning is enough.
    id: "roadNoiseStrategic", label: "Veistøy (strategisk støykart)", category: "environment", source: "svv-stoy-strategisk", importance: "normal",
    table: "stoy_strategisk", find: { kind: "within" },
    read: (rows, address) => {
      if (!rows.length) return null;
      const lden = Math.max(...rows.map((r) => Number(r.lden)));
      const band = lden >= 75 ? "over 75 dB" : `${lden}–${lden + 5} dB`;
      const year = rows[0].year ? ` (${rows[0].year})` : "";
      const score = lden >= 75 ? 0 : lden >= 70 ? 10 : lden >= 65 ? 20 : lden >= 60 ? 50 : lden >= 55 ? 70 : 90;
      const oslo = address.municipalityNumber === "0301";
      const warning =
        oslo && lden >= 65 ? { severity: "medium" as const, text: `Veistøy ${band}` }
        : oslo && lden >= 55 ? { severity: "low" as const, text: `Veistøy ${band}` }
        : undefined;
      return { value: lden, unit: "dB", display: `${band}${year}`, effect: lden >= 55 ? "bad" : "good", score, ...(warning && { warning }) };
    },
  },
  {
    // data/scripts/banestoy.ts (Sverre): stoysone 'rød' (Lden >= 68 dB) | 'gul' (Lden >= 58 dB), line (e.g. Østfoldbanen).
    // Bane NOR maps its whole network, so no zone = no railway noise zone. Metro (T-bane) and tram are not included.
    id: "railNoise", label: "Jernbanestøy", category: "environment", source: "banenor-stoy", importance: "normal",
    table: "banestoy", find: { kind: "within" },
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Ikke i støysone fra jernbane", effect: "good" };
      const red = rows.find((r) => r.stoysone === "rød");
      const line = (red ?? rows[0]).line ? `, ${(red ?? rows[0]).line}` : "";
      return red
        ? { value: "rød", display: `Rød støysone fra jernbane${line} (over 68 dB)`, effect: "bad", score: 10, warning: { severity: "medium", text: "Rød støysone fra jernbane" } }
        : { value: "gul", display: `Gul støysone fra jernbane${line} (58–68 dB)`, effect: "bad", score: 50, warning: { severity: "low", text: "Gul støysone fra jernbane" } };
    },
  },
  {
    // data/scripts/flystoy.ts (Sverre): stoysone 'rød' (Lden >= 62 dB) | 'gul' (Lden >= 52 dB), airport.
    // Avinor maps every airport it runs, and Oslo + Akershus has only Gardermoen, so no zone = no aircraft noise zone.
    id: "aircraftNoise", label: "Flystøy", category: "environment", source: "avinor-flystoy", importance: "normal",
    table: "flystoy", find: { kind: "within" },
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Ikke i flystøysone", effect: "good" };
      const red = rows.find((r) => r.stoysone === "rød");
      const zone = red ?? rows[0];
      return red
        ? { value: "rød", display: `Rød flystøysone, ${zone.airport} (over 62 dB)`, effect: "bad", score: 10, warning: { severity: "medium", text: "Rød støysone fra fly" } }
        : { value: "gul", display: `Gul flystøysone, ${zone.airport} (52–62 dB)`, effect: "bad", score: 50, warning: { severity: "low", text: "Gul støysone fra fly" } };
    },
  },
  {
    id: "pollutedGround", label: "Forurenset grunn", category: "environment", source: "mdir-grunnforurensning", importance: "normal",
    table: "grunnforurensning", find: { kind: "nearest", maxM: 100 },
    read: (rows) =>
      rows.length
        ? { value: Math.round(Number(rows[0].distanceM)), unit: "m", display: `Registrert lokalitet ${metres(Number(rows[0].distanceM))} unna`, effect: "bad", score: 40, warning: { severity: "low", text: "Forurenset grunn registrert i nærheten" } }
        : { value: null, display: "Ingen registrert innen 100 m", effect: "good" },
  },

  // Location. Points, nearest within a distance.
  {
    id: "transitStop", label: "Nærmeste holdeplass", category: "location", source: "entur-stopp", importance: "normal",
    table: "stops", find: { kind: "nearest", maxM: 2000 },
    read: nearestScore([[300, 100], [600, 75], [1000, 50], [2000, 20]]),
  },
  {
    // data/scripts/stops.ts (Even): departures and lines per stop on one weekday (departuresDate).
    // Busiest stop, not a sum: a trip passing two nearby stops would count twice.
    id: "transitDepartures", label: "Avganger innen 500 m", category: "location", source: "entur-stopp", importance: "normal",
    table: "stops", find: { kind: "around", radiusM: 500 },
    read: (rows) => {
      const served = rows.filter((r) => Number(r.departures) > 0);
      if (!served.length) return { value: 0, display: "Ingen avganger innen 500 m", effect: "bad", score: 0 };
      const best = served.reduce((a, b) => (Number(b.departures) > Number(a.departures) ? b : a));
      const n = Number(best.departures);
      const lines = Number(best.lines);
      const score = n >= 200 ? 100 : n >= 100 ? 85 : n >= 50 ? 65 : n >= 20 ? 40 : 20;
      const where = best.name ? ` (${best.name}, ${metres(Number(best.distanceM))})` : "";
      return {
        value: n, unit: "avganger", display: `${n} avganger, ${lines} ${lines === 1 ? "linje" : "linjer"}${where}`,
        effect: score >= 50 ? "good" : "bad", score,
      };
    },
  },
  {
    id: "school", label: "Nærmeste grunnskole", category: "location", source: "udir-skoler", importance: "normal",
    table: "schools", find: { kind: "nearest", maxM: 5000, where: "isPrimary" },
    read: nearestScore([[500, 100], [1000, 80], [2000, 50], [5000, 20]]),
  },
  {
    id: "kindergarten", label: "Nærmeste barnehage", category: "location", source: "udir-barnehager", importance: "normal",
    table: "kindergartens", find: { kind: "nearest", maxM: 3000 },
    read: nearestScore([[400, 100], [800, 80], [1500, 50], [3000, 20]]),
  },
  // data/scripts/tjenester.ts (Sverre): OpenStreetMap, kind 'dagligvare' | 'apotek' | 'lege' (GP / legekontor).
  {
    id: "groceryStore", label: "Nærmeste dagligvarebutikk", category: "location", source: "osm", importance: "normal",
    table: "tjenester", find: { kind: "nearest", maxM: 3000, where: "kind = 'dagligvare'" },
    read: nearestScore([[400, 100], [800, 80], [1500, 50], [3000, 20]]),
  },
  {
    id: "pharmacy", label: "Nærmeste apotek", category: "location", source: "osm", importance: "normal",
    table: "tjenester", find: { kind: "nearest", maxM: 5000, where: "kind = 'apotek'" },
    read: nearestScore([[800, 100], [1500, 80], [3000, 50], [5000, 20]]),
  },
  {
    id: "doctor", label: "Nærmeste legekontor", category: "location", source: "osm", importance: "normal",
    table: "tjenester", find: { kind: "nearest", maxM: 5000, where: "kind = 'lege'" },
    read: nearestScore([[800, 100], [1500, 80], [3000, 50], [5000, 20]]),
  },

  // Nature & leisure.
  {
    id: "trails", label: "Nærmeste tursti eller skiløype", category: "nature", source: "kartverket-turruter", importance: "normal",
    table: "turruter", find: { kind: "nearest", maxM: 3000 },
    read: nearestScore([[300, 100], [1000, 75], [2000, 40], [3000, 20]]),
  },
  {
    // data/scripts/verneomrader.ts (Even): Naturbase, name (official, e.g. "Kolsås-Dælivann landskapsvernområde"), protectionType.
    // Info only: being near (or inside) protected nature is neither good nor bad for the score.
    id: "protectedNature", label: "Nærmeste verneområde", category: "nature", source: "mdir-naturvern", importance: "normal",
    table: "verneomrader", find: { kind: "nearest", maxM: 3000 },
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Ingen innen 3 km", effect: "neutral" };
      const d = Number(rows[0].distanceM);
      if (d === 0) return { value: 0, unit: "m", display: `Inne i ${rows[0].name}`, effect: "neutral" };
      return { value: Math.round(d), unit: "m", display: `${rows[0].name}, ${metres(d)}`, effect: "neutral" };
    },
  },
  {
    // data/scripts/friluftsomrader.ts (Even): state-secured outdoor recreation areas (beaches, parks, forest).
    // Close = good. None within 3 km is neutral, not bad: only 182 areas, so many parks and forests are not in this set.
    id: "recreationArea", label: "Nærmeste sikra friluftsområde", category: "nature", source: "mdir-friluft", importance: "normal",
    table: "friluftsomrader", find: { kind: "nearest", maxM: 3000 },
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Ingen innen 3 km", effect: "neutral" };
      const d = Number(rows[0].distanceM);
      const score = d <= 500 ? 100 : d <= 1000 ? 80 : d <= 2000 ? 50 : 30;
      const effect: Effect = score >= 50 ? "good" : "bad";
      if (d === 0) return { value: 0, unit: "m", display: `Inne i ${rows[0].name}`, effect, score };
      return { value: Math.round(d), unit: "m", display: `${rows[0].name}, ${metres(d)}`, effect, score };
    },
  },

  // Area. kommuner: data/scripts/kommuner.ts. ssb_kommuner: data/scripts/ssb.ts (Even), one row per municipality with its geom.
  // Stats are information, not judgement: neutral, not scored. Exception: crime, scored against Norway's rate.
  {
    id: "municipality", label: "Kommune", category: "area", source: "kartverket-kommuner", importance: "normal",
    table: "kommuner", find: { kind: "within" },
    read: (rows) => (rows.length ? { value: rows[0].kommunenummer, display: `${rows[0].name} (${rows[0].fylkesnavn})`, effect: "neutral" } : null),
  },
  {
    // data/scripts/grunnkretser.ts (Sverre): SSB grunnkrets (small statistical area) with population, perKm2,
    // pctUnder20, pctOver70. Info only: no right or wrong number of neighbours, so never scored.
    id: "neighbourhood", label: "Nabolaget (grunnkrets)", category: "area", source: "ssb-grunnkretser", importance: "normal",
    table: "grunnkretser", find: { kind: "within" },
    read: (rows) => {
      const g = rows[0];
      if (!g || g.population == null) return null;
      const people = Number(g.population).toLocaleString("nb-NO");
      const density = g.perKm2 != null ? `, ${Number(g.perKm2).toLocaleString("nb-NO")} per km²` : "";
      return { value: Number(g.population), unit: "innbyggere", display: `${g.name}: ${people} innbyggere${density} (${g.year})`, effect: "neutral" };
    },
  },
  {
    id: "neighbourhoodAge", label: "Aldersfordeling i nabolaget", category: "area", source: "ssb-grunnkretser", importance: "normal",
    table: "grunnkretser", find: { kind: "within" },
    read: (rows) => {
      const g = rows[0];
      if (!g || g.pctUnder20 == null || Number(g.population) < 20) return null; // too few people for a meaningful share
      return { value: Number(g.pctUnder20), unit: "%", display: `${g.pctUnder20} % under 20 år, ${g.pctOver70} % over 70 år`, effect: "neutral" };
    },
  },
  {
    id: "population", label: "Folketall i kommunen", category: "area", source: "ssb-kommune", importance: "normal",
    table: "ssb_kommuner", find: { kind: "within" },
    read: (rows) =>
      rows[0]?.population != null
        ? { value: Number(rows[0].population), display: `${Number(rows[0].population).toLocaleString("nb-NO")} (${rows[0].populationYear})`, unit: "innbyggere", effect: "neutral" }
        : null,
  },
  {
    id: "medianIncome", label: "Medianinntekt etter skatt (husholdning)", category: "area", source: "ssb-kommune", importance: "normal",
    table: "ssb_kommuner", find: { kind: "within" },
    read: (rows) =>
      rows[0]?.incomeMedianAfterTax != null
        ? { value: Number(rows[0].incomeMedianAfterTax), display: `${Number(rows[0].incomeMedianAfterTax).toLocaleString("nb-NO")} kr (${rows[0].incomeYear})`, unit: "kr", effect: "neutral" }
        : null,
  },
  {
    // data/scripts/ssb_inntekt_omrader.ts (Even): inntekt_omrader, SSB 06944, levels 'delomrade' | 'bydel' | 'kommune'.
    // The smallest area with a number wins; the municipality is shown next to it. Info only: never scored.
    id: "areaIncome", label: "Medianinntekt i nærområdet (husholdning)", category: "area", source: "ssb-inntekt-omrader", importance: "normal",
    table: "inntekt_omrader", find: { kind: "within" },
    read: (rows) => {
      const order = ["delomrade", "bydel", "kommune"];
      const withValue = rows.filter((r) => r.medianAfterTax != null).sort((a, b) => order.indexOf(String(a.level)) - order.indexOf(String(b.level)));
      const r = withValue[0];
      if (!r) return null;
      const kommune = withValue.find((x) => x.level === "kommune");
      const nok = (v: unknown) => `${Number(v).toLocaleString("nb-NO")} kr`;
      const compare = r.level !== "kommune" && kommune ? `, kommunen ${nok(kommune.medianAfterTax)}` : "";
      return { value: Number(r.medianAfterTax), unit: "kr", display: `${nok(r.medianAfterTax)} i ${r.name} (${r.year})${compare}`, effect: "neutral" };
    },
  },
  {
    // data/scripts/ssb_krim.ts (Even): krim_omrader: Oslo bydel (Oslo kommune KRI002, 1 year) or kommune (SSB 08487, 2-year average).
    // Scored against Norway's rate (crimeReading). Weighed most in the family perspective (api/src/perspectives.ts).
    id: "crimeRate", label: "Anmeldte lovbrudd i området", category: "area", source: "ssb-krim", importance: "normal",
    table: "krim_omrader", find: { kind: "within" },
    read: (rows) => crimeReading(rows, "total"),
  },
  {
    id: "violentCrime", label: "Anmeldt vold i området", category: "area", source: "ssb-krim", importance: "normal",
    table: "krim_omrader", find: { kind: "within" },
    read: (rows) => crimeReading(rows, "violence"),
  },
  {
    // data/scripts/kulturminner.ts (Even): Riksantikvaren sites, status (e.g. "vedtaksfredet"), statusCode (AUT, KOM, ...), fredet.
    // value = statusCode of the nearest site within 50 m (null = none). Info only: never scored.
    id: "culturalHeritage", label: "Kulturminner innen 50 m", category: "area", source: "ra-kulturminner", importance: "normal",
    table: "kulturminner", find: { kind: "around", radiusM: 50 },
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Ingen registrert innen 50 m", effect: "neutral" };
      const r = rows[0];
      const d = Number(r.distanceM);
      const where = d === 0 ? "på adressen" : `${metres(d)} unna`;
      const more = rows.length > 1 ? `, og ${rows.length - 1} til` : "";
      return { value: r.statusCode, display: `${r.name} (${r.status ?? "registrert"}), ${where}${more}`, effect: "neutral" };
    },
  },
];
