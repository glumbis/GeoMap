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
  /** A finding serious enough to show at the top. high caps the score (see rating.ts). */
  warning?: { severity: Severity; text: string };
  explanation?: string;
}

/**
 * How to ask the table about the address point. Every row comes back without `geom`.
 * - within:  rows whose geometry contains the point (zones, municipalities).
 * - nearest: the closest row within maxM metres, with an extra `distanceM` column.
 * - count:   one row `{ count }`: features within radiusM metres.
 */
export type Find = ({ kind: "within" } | { kind: "nearest"; maxM: number } | { kind: "count"; radiusM: number }) & {
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
  /** rows is [] when nothing was found. Return null when the source has no coverage here. */
  read: (rows: Row[], address: Address) => Reading | null;
}

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
  { id: "nve-steinsprang", name: "Aktsomhetsområder steinsprang", owner: "NVE", url: "https://kartkatalog.geonorge.no/metadata/steinsprang-aktsomhetsomraader/02c6d51c-4e8c-4948-a620-dc046c8cb747", licence: "NLOD 2.0" },
  { id: "ngu-losmasser", name: "Løsmasser", owner: "NGU", url: "https://kartkatalog.geonorge.no/metadata/loesmasser-regionalt/e5847c27-0c30-44b6-9198-a797c177fa20", licence: "NLOD 2.0" },
  { id: "ngu-radon", name: "Radon aktsomhet", owner: "NGU", url: "https://kartkatalog.geonorge.no/metadata/radon-aktsomhet/dc0605f3-2301-4abe-a91f-6da42464c281", licence: "NLOD 2.0" },
  { id: "svv-stoy", name: "Støykartlegging veg", owner: "Statens vegvesen", url: "https://kartkatalog.geonorge.no/metadata/stoeykartlegging-veg-etter-t-1442/d6db9f39-9725-4630-909e-5e62f09a0766", licence: "NLOD 2.0" },
  { id: "svv-stoy-strategisk", name: "Strategisk støykartlegging veg", owner: "Statens vegvesen", url: "https://kartkatalog.geonorge.no/metadata/stoeykart-strategisk-stykartlegging-stydirektivet/93a154a7-47d5-47b8-bdda-f156d92386cc", licence: "NLOD 2.0" },
  { id: "mdir-grunnforurensning", name: "Forurenset grunn", owner: "Miljødirektoratet", url: "https://kartkatalog.geonorge.no/metadata/forurenset-grunn/e48e71ac-16fc-4e47-9e7f-c0a4a4bbfad0", licence: "NLOD 2.0" },
  { id: "entur-stopp", name: "Holdeplasser", owner: "Entur", url: "https://developer.entur.org/stops-and-timetable-data", licence: "NLOD 2.0" },
  { id: "udir-skoler", name: "Grunnskoler", owner: "Utdanningsdirektoratet", url: "https://kartkatalog.geonorge.no/metadata/grunnskoler/db4b872f-264d-434c-9574-57232f1e90d2", licence: "NLOD 2.0" },
  { id: "udir-barnehager", name: "Barnehager", owner: "Utdanningsdirektoratet", url: "https://kartkatalog.geonorge.no/metadata/barnehager/e229a364-0caa-4a24-8dbe-225b3d83e075", licence: "NLOD 2.0" },
  { id: "kartverket-turruter", name: "Turrutebasen", owner: "Kartverket", url: "https://kartkatalog.geonorge.no/metadata/turrutebasen/d1422d17-6d95-4ef1-96ab-8af31744dd63", licence: "CC BY 4.0" },
  { id: "ssb-kommune", name: "Statistikkbanken", owner: "SSB", url: "https://www.ssb.no/statbank", licence: "CC BY 4.0" },
];

// ---- Helpers for common shapes -------------------------------------------------------------

const metres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

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
    table: "losmasser", find: { kind: "within" }, // proposed columns: jordart (text), marin_leire (boolean)
    read: (rows) => {
      if (!rows.length) return null; // map has holes: no polygon = no coverage, not "good"
      const r = rows[0];
      const clay = r.marin_leire === true;
      return {
        value: r.jordart, display: String(r.jordart), effect: clay ? "bad" : "neutral", score: clay ? 40 : 80,
        ...(clay && { warning: { severity: "low" as const, text: "Marin leire i grunnen" } }),
      };
    },
  },
  {
    id: "radon", label: "Radon", category: "ground", source: "ngu-radon", importance: "critical",
    table: "radon", find: { kind: "within" }, // proposed column: aktsomhet ('høy' | 'moderat til lav' | 'usikker')
    read: (rows) => {
      if (!rows.length) return null;
      const a = String(rows[0].aktsomhet).toLowerCase();
      if (a.startsWith("høy")) {
        return { value: a, display: "Høy aktsomhet", effect: "bad", score: 30, warning: { severity: "medium", text: "Høy radonaktsomhet" } };
      }
      if (a.startsWith("moderat")) return { value: a, display: "Moderat til lav aktsomhet", effect: "good", score: 90 };
      return null; // 'usikker' = the source can't say
    },
  },

  // Natural hazards. Proposed tables from NVE (Sverre). No zone = "not in a mapped zone": that is real data.
  {
    id: "quickClay", label: "Kvikkleire faresone", category: "hazards", source: "nve-kvikkleire", importance: "critical",
    table: "nve_kvikkleire", find: { kind: "within" }, // data/scripts/nve_kvikkleire.ts (Sverre): name, faregrad ('Høy' | 'Middels' | 'Lav' | 'Ingen'), risikoklasse
    read: (rows) => {
      if (!rows.length) return { value: null, display: "Ikke i kartlagt faresone", effect: "good" };
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
    read: (rows) => {
      if (!rows.length) return { value: false, display: "Ikke i kartlagt flomsone", effect: "good" };
      const years = Math.min(...rows.map((r) => Number(r.gjentaksintervall) || 200));
      // lavpunkt: below the flood level but not directly connected to the river
      const lowPoint = rows.filter((r) => Number(r.gjentaksintervall) === years).every((r) => r.lowPoint === true);
      return {
        value: years, unit: "år", display: `I ${years}-årsflomsone${lowPoint ? " (lavpunkt)" : ""}`, effect: "bad", score: years <= 10 ? 0 : 20,
        ...(lowPoint && { explanation: "Lavpunkt: området ligger lavere enn flomvannstanden, men har ikke direkte forbindelse til elva. Det kan likevel bli oversvømt gjennom kummer, rør eller grunnvann." }),
        warning: { severity: years <= 10 ? "high" : "medium", text: `Ligger i ${years}-årsflomsone` },
      };
    },
  },
  {
    id: "rockfall", label: "Steinsprang", category: "hazards", source: "nve-steinsprang", importance: "normal",
    table: "steinsprang", find: { kind: "within" },
    read: (rows) =>
      rows.length
        ? { value: true, display: "I aktsomhetsområde for steinsprang", effect: "bad", score: 30, warning: { severity: "medium", text: "Aktsomhetsområde for steinsprang" } }
        : { value: false, display: "Ikke i aktsomhetsområde", effect: "good" },
  },

  // Environment.
  {
    id: "roadNoise", label: "Veistøy", category: "environment", source: "svv-stoy", importance: "normal",
    table: "veistoy", find: { kind: "within" }, // data/scripts/veistoy.ts (Even): stoysone 'rød' | 'gul'
    read: (rows, address) => {
      if (!rows.length) {
        // T-1442 has no data in Oslo: an empty result there means "unknown", not "quiet".
        if (address.municipalityNumber === "0301") return null;
        return { value: null, display: "Ikke i støysone", effect: "good", explanation: "Kartet dekker bare riks- og fylkesveier, ikke kommunale veier." };
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
    id: "school", label: "Nærmeste grunnskole", category: "location", source: "udir-skoler", importance: "normal",
    table: "schools", find: { kind: "nearest", maxM: 5000, where: "isPrimary" },
    read: nearestScore([[500, 100], [1000, 80], [2000, 50], [5000, 20]]),
  },
  {
    id: "kindergarten", label: "Nærmeste barnehage", category: "location", source: "udir-barnehager", importance: "normal",
    table: "kindergartens", find: { kind: "nearest", maxM: 3000 },
    read: nearestScore([[400, 100], [800, 80], [1500, 50], [3000, 20]]),
  },

  // Nature & leisure.
  {
    id: "trails", label: "Nærmeste tursti eller skiløype", category: "nature", source: "kartverket-turruter", importance: "normal",
    table: "turruter", find: { kind: "nearest", maxM: 3000 },
    read: nearestScore([[300, 100], [1000, 75], [2000, 40], [3000, 20]]),
  },

  // Area. kommuner: data/scripts/kommuner.ts. ssb_kommuner: data/scripts/ssb.ts (Even), one row per municipality with its geom.
  // Stats are information, not judgement: neutral, not scored.
  {
    id: "municipality", label: "Kommune", category: "area", source: "kartverket-kommuner", importance: "normal",
    table: "kommuner", find: { kind: "within" },
    read: (rows) => (rows.length ? { value: rows[0].kommunenummer, display: `${rows[0].name} (${rows[0].fylkesnavn})`, effect: "neutral" } : null),
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
];
